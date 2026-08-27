import { and, eq, getTableColumns, gte, ilike, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { classAddress, publicFeedSchedules } from "@/lib/coachweek";
import { clockParts, fmtDayHeaderRel, occurrenceEnded, runsOn, timeToMinutes, todayIso } from "@/lib/format";

export const DEFAULT_PREVIEW_CITY = "Jersey City, NJ";
const DEFAULT_PREVIEW_POINT = { lat: 40.7178, lng: -74.0435 };
const PREVIEW_DAYS = 31;
const PREVIEW_CLASS_LIMIT = 48;

export type PublicPreviewClass = {
  key: string;
  id: string;
  base: string;
  iso: string;
  day: string;
  name: string;
  place: string;
  coach: string | null;
  photo: string | null;
  color: string;
  time: string;
  at: number;
  href: string;
};

export type PublicPreviewData = {
  city: string;
  cities: string[];
  classes: PublicPreviewClass[];
};

/** Keep the anonymous preview broad as well as busy. A straight slice lets a
 * crowded first few days consume the entire payload, so take one class from
 * each active day before taking a second, third, and so on. The result is then
 * returned in calendar order for rendering. */
function spreadAcrossDays(items: PublicPreviewClass[], limit: number) {
  const byDay = new Map<string, PublicPreviewClass[]>();
  for (const item of items) {
    const day = byDay.get(item.iso);
    if (day) day.push(item);
    else byDay.set(item.iso, [item]);
  }
  const selected: PublicPreviewClass[] = [];
  for (let depth = 0; selected.length < limit; depth += 1) {
    let found = false;
    for (const day of byDay.values()) {
      const item = day[depth];
      if (!item) continue;
      found = true;
      selected.push(item);
      if (selected.length === limit) break;
    }
    if (!found) break;
  }
  return selected.sort((a, b) => a.iso.localeCompare(b.iso) || a.at - b.at || a.name.localeCompare(b.name));
}

const { image: _image, ...classColumns } = getTableColumns(schema.classes);

/**
 * A deliberately small anonymous calendar preview. It never loads a viewer, follows,
 * saves, messages, or the full discover graph: the front door only needs to
 * prove that useful schedules exist nearby. Everything here is public data.
 */
export async function publicPreview(rawCity?: string | null): Promise<PublicPreviewData> {
  const city = (rawCity?.trim() || DEFAULT_PREVIEW_CITY).slice(0, 80);
  const db = await getDb();
  const cityLike = `%${city.split(",")[0]?.trim() || city}%`;

  const [coachRows, cityRows, selectedCityPoints] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        kind: schema.users.kind,
        name: schema.users.name,
        handle: schema.users.handle,
        location: schema.users.location,
        photo: sql<string | null>`coalesce(${schema.users.photoThumb}, ${schema.users.photo})`,
        avatarColor: schema.users.avatarColor,
        shiftsPublic: schema.users.shiftsPublic,
      })
      .from(schema.users)
      .where(and(
        eq(schema.users.kind, "coach"),
        eq(schema.users.discoverable, true),
        isNotNull(schema.users.handle),
        ilike(schema.users.location, cityLike),
      ))
      .limit(36),
    db
      .selectDistinct({ location: schema.users.location })
      .from(schema.users)
      .where(and(eq(schema.users.discoverable, true), isNotNull(schema.users.location)))
      .limit(40),
    db
      .select({ lat: schema.users.locationLat, lng: schema.users.locationLng })
      .from(schema.users)
      .where(and(
        eq(schema.users.discoverable, true),
        ilike(schema.users.location, cityLike),
        isNotNull(schema.users.locationLat),
        isNotNull(schema.users.locationLng),
      ))
      .limit(1),
  ]);

  const selectedPoint = selectedCityPoints[0]?.lat != null && selectedCityPoints[0]?.lng != null
    ? { lat: selectedCityPoints[0].lat, lng: selectedCityPoints[0].lng }
    : city.toLowerCase() === DEFAULT_PREVIEW_CITY.toLowerCase()
      ? DEFAULT_PREVIEW_POINT
      : null;
  const studioArea = selectedPoint
    ? or(
        ilike(schema.studios.address, cityLike),
        and(
          gte(schema.studios.lat, selectedPoint.lat - 0.08),
          lte(schema.studios.lat, selectedPoint.lat + 0.08),
          gte(schema.studios.lng, selectedPoint.lng - 0.1),
          lte(schema.studios.lng, selectedPoint.lng + 0.1),
        ),
      )
    : ilike(schema.studios.address, cityLike);
  const cityStudios = await db
    .select({
      id: schema.studios.id,
      slug: schema.studios.slug,
      name: schema.studios.name,
      address: schema.studios.address,
      photo: schema.studios.photo,
      accountUserId: schema.studios.accountUserId,
    })
    .from(schema.studios)
    .where(and(isNotNull(schema.studios.slug), studioArea))
    .limit(36);

  const from = todayIso();
  const endDate = new Date(`${from}T00:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + PREVIEW_DAYS - 1);
  const through = endDate.toISOString().slice(0, 10);
  const gymIds = cityStudios.flatMap((studio) => studio.accountUserId ? [studio.accountUserId] : []);
  const cityStudioIds = cityStudios.map((studio) => studio.id);
  const studioScheduleScope = gymIds.length && cityStudioIds.length
    ? or(inArray(schema.classes.userId, gymIds), inArray(schema.classes.studioId, cityStudioIds))
    : gymIds.length
      ? inArray(schema.classes.userId, gymIds)
      : inArray(schema.classes.studioId, cityStudioIds);
  const [personSchedules, gymSchedules] = await Promise.all([
    coachRows.length
      ? publicFeedSchedules(coachRows.map((row) => ({ id: row.id, shiftsPublic: row.shiftsPublic })), { start: from, end: through })
      : Promise.resolve([]),
    gymIds.length || cityStudioIds.length
      ? db.select(classColumns).from(schema.classes).where(and(
          studioScheduleScope,
          eq(schema.classes.isPublic, true),
        )).then((rows) => rows.map((row) => ({ ...row, image: null })))
      : Promise.resolve([]),
  ]);

  const referencedStudioIds = [...new Set(personSchedules.flatMap((row) => row.studioId ? [row.studioId] : []))];
  const referencedUserIds = [...new Set(gymSchedules.flatMap((row) => [row.userId, ...(row.coachUserId ? [row.coachUserId] : [])]))];
  const [extraStudios, referencedUsers] = await Promise.all([
    referencedStudioIds.length
      ? db
        .select({
          id: schema.studios.id,
          slug: schema.studios.slug,
          name: schema.studios.name,
          address: schema.studios.address,
          photo: schema.studios.photo,
          accountUserId: schema.studios.accountUserId,
        })
        .from(schema.studios)
        .where(inArray(schema.studios.id, referencedStudioIds))
      : Promise.resolve([]),
    referencedUserIds.length
      ? db
          .select({
            id: schema.users.id,
            kind: schema.users.kind,
            name: schema.users.name,
            handle: schema.users.handle,
            photo: sql<string | null>`coalesce(${schema.users.photoThumb}, ${schema.users.photo})`,
            avatarColor: schema.users.avatarColor,
          })
          .from(schema.users)
          .where(inArray(schema.users.id, referencedUserIds))
      : Promise.resolve([]),
  ]);
  const studios = [...new Map([...cityStudios, ...extraStudios].map((row) => [row.id, row])).values()];
  const studioById = new Map(studios.map((row) => [row.id, row]));
  const coachById = new Map([...coachRows, ...referencedUsers].map((row) => [row.id, row]));
  const gymStudioByUser = new Map(cityStudios.flatMap((row) => row.accountUserId ? [[row.accountUserId, row] as const] : []));

  const occurrences: PublicPreviewClass[] = [];
  const seen = new Set<string>();
  const start = new Date(`${from}T00:00:00Z`);
  for (let offset = 0; offset < PREVIEW_DAYS; offset++) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + offset);
    const iso = date.toISOString().slice(0, 10);
    const dow = (date.getUTCDay() + 6) % 7;
    for (const row of [...personSchedules, ...gymSchedules]) {
      if (!row.isPublic || !runsOn(row, iso, dow) || occurrenceEnded(iso, row.startTime, row.durationMin, row.timeZone)) continue;
      const occurrenceKey = `${row.id}|${iso}`;
      if (seen.has(occurrenceKey)) continue;
      const owner = coachById.get("ownerUserId" in row ? row.ownerUserId : row.userId);
      const studio = row.studioId ? studioById.get(row.studioId) : gymStudioByUser.get(row.userId);
      const shift = "shift" in row ? row.shift : owner?.kind === "gym";
      const coach = owner?.kind === "gym" ? null : owner;
      const address = classAddress({ shift }, coach?.handle ?? null, studio?.slug);
      if (!address) continue;
      seen.add(occurrenceKey);
      const clock = clockParts(row.startTime);
      occurrences.push({
        key: occurrenceKey,
        id: row.id,
        base: address.base,
        iso,
        day: fmtDayHeaderRel(iso, from),
        name: row.name,
        place: studio?.name ?? row.location ?? "Location to come",
        coach: coach?.name?.trim() || null,
        photo: coach?.photo ?? studio?.photo ?? null,
        color: coach ? avatarColor(coach) : studio ? avatarColor({ id: studio.id }) : "#166b3a",
        time: `${clock.hm}${clock.ap.toLowerCase()}`,
        at: timeToMinutes(row.startTime),
        href: `/${address.base}/${row.id}?d=${iso}`,
      });
    }
  }
  occurrences.sort((a, b) => a.iso.localeCompare(b.iso) || a.at - b.at || a.name.localeCompare(b.name));

  const cities = [...new Set([
    city,
    ...cityRows.flatMap((row) => {
      const parts = row.location?.split(",").map((part) => part.trim()).filter(Boolean) ?? [];
      if (!parts.length) return [];
      return [parts.length > 1 ? `${parts[0]}, ${parts[1]}` : parts[0]];
    }),
  ])].sort((a, b) => a === city ? -1 : b === city ? 1 : a.localeCompare(b));

  return {
    city,
    cities,
    classes: spreadAcrossDays(occurrences, PREVIEW_CLASS_LIMIT),
  };
}
