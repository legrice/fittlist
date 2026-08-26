import { and, eq, getTableColumns, ilike, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { classAddress, publicFeedSchedules } from "@/lib/coachweek";
import { clockParts, fmtDayHeaderRel, occurrenceEnded, runsOn, timeToMinutes, todayIso } from "@/lib/format";

export const DEFAULT_PREVIEW_CITY = "Jersey City, NJ";
const PREVIEW_DAYS = 14;

export type PublicPreviewClass = {
  key: string;
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

  const [coachRows, cityStudios, cityRows] = await Promise.all([
    db
      .select({
        id: schema.users.id,
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
      .select({
        id: schema.studios.id,
        slug: schema.studios.slug,
        name: schema.studios.name,
        address: schema.studios.address,
        photo: schema.studios.photo,
        accountUserId: schema.studios.accountUserId,
      })
      .from(schema.studios)
      .where(and(isNotNull(schema.studios.slug), ilike(schema.studios.address, cityLike)))
      .limit(24),
    db
      .selectDistinct({ location: schema.users.location })
      .from(schema.users)
      .where(and(eq(schema.users.discoverable, true), isNotNull(schema.users.location)))
      .limit(40),
  ]);

  const from = todayIso();
  const endDate = new Date(`${from}T00:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + PREVIEW_DAYS - 1);
  const through = endDate.toISOString().slice(0, 10);
  const gymIds = cityStudios.flatMap((studio) => studio.accountUserId ? [studio.accountUserId] : []);
  const [personSchedules, gymSchedules] = await Promise.all([
    coachRows.length
      ? publicFeedSchedules(coachRows.map((row) => ({ id: row.id, shiftsPublic: row.shiftsPublic })), { start: from, end: through })
      : Promise.resolve([]),
    gymIds.length
      ? db.select(classColumns).from(schema.classes).where(and(
          inArray(schema.classes.userId, gymIds),
          eq(schema.classes.isPublic, true),
        )).then((rows) => rows.map((row) => ({ ...row, image: null })))
      : Promise.resolve([]),
  ]);

  const referencedStudioIds = [...new Set(personSchedules.flatMap((row) => row.studioId ? [row.studioId] : []))];
  const extraStudios = referencedStudioIds.length
    ? await db
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
    : [];
  const studios = [...new Map([...cityStudios, ...extraStudios].map((row) => [row.id, row])).values()];
  const studioById = new Map(studios.map((row) => [row.id, row]));
  const coachById = new Map(coachRows.map((row) => [row.id, row]));
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
      if (!row.isPublic || !runsOn(row, iso, dow) || occurrenceEnded(iso, row.startTime, row.durationMin)) continue;
      const occurrenceKey = `${row.id}|${iso}`;
      if (seen.has(occurrenceKey)) continue;
      const coach = coachById.get("ownerUserId" in row ? row.ownerUserId : row.userId);
      const studio = row.studioId ? studioById.get(row.studioId) : gymStudioByUser.get(row.userId);
      const shift = "shift" in row ? row.shift : true;
      const address = classAddress({ shift }, coach?.handle ?? null, studio?.slug);
      if (!address) continue;
      seen.add(occurrenceKey);
      const clock = clockParts(row.startTime);
      occurrences.push({
        key: occurrenceKey,
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
    classes: occurrences.slice(0, 18),
  };
}
