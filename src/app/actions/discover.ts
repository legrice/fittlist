"use server";

import { and, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { hiddenFrom } from "@/lib/blocks";
import { publicSchedules } from "@/lib/coachweek";
import { clockParts, occurrenceEnded, runsOn, todayIso } from "@/lib/format";
import type { DirPerson, DirStudio } from "@/components/DirectoryRows";
import { currentUser } from "@/lib/current-user";

export type DiscoverData = {
  people: DirPerson[];
  cities: string[];
  myCity: string | null;
  myLat: number | null;
  myLng: number | null;
};

/**
 * The directory, as data.
 *
 * It was the body of `/discover/page.tsx` and it moved out here the moment
 * the search button on Following started opening the list as a sheet instead
 * of navigating to it. Two callers means one loader: a sheet computing the
 * quality bar or the block rules even slightly differently from the page
 * would list somebody in one place and not the other, and nobody would notice
 * for months.
 */
const nearBounds = (lat: number | null, lng: number | null, miles?: number) => {
  if (lat == null || lng == null || !miles || miles <= 0) return null;
  const latDelta = miles / 69;
  const lngDelta = miles / Math.max(6, 69 * Math.cos(lat * Math.PI / 180));
  return { minLat:lat-latDelta, maxLat:lat+latDelta, minLng:lng-lngDelta, maxLng:lng+lngDelta };
};

export async function discoverPeople(distanceMiles?: number, center?: { lat:number; lng:number }): Promise<DiscoverData> {
  const me = await currentUser();
  if (!me) return { people: [], cities: [], myCity: null, myLat: null, myLng: null };
  const userId = me.id;
  const db = await getDb();
  const bounds = nearBounds(center?.lat ?? me.locationLat, center?.lng ?? me.locationLng, distanceMiles);

  // Blocked in either direction: not on the list. Discover is where someone
  // who was removed would go looking, so it has to be the same nothing the
  // profile is, and it drops the ones you removed too so you aren't handed
  // them back as a suggestion.
  const [everyone, hidden, followRows, askRows] = await Promise.all([
    // Keep this projection lean: legacy profile photos can be large, and the
    // schedule builder only needs the coach IDs and public-shift preference.
    db.select({
      id:schema.users.id,
      handle:schema.users.handle,
      name:schema.users.name,
      photo:sql<string|null>`coalesce(${schema.users.photoThumb}, ${schema.users.photo})`,
      title:schema.users.title,
      about:schema.users.about,
      location:schema.users.location,
      locationLat:schema.users.locationLat,
      locationLng:schema.users.locationLng,
      availability:schema.users.availability,
      disciplines:schema.users.disciplines,
      avatarColor:schema.users.avatarColor,
      shiftsPublic:schema.users.shiftsPublic,
      createdAt:schema.users.createdAt,
    }).from(schema.users).where(and(
      eq(schema.users.discoverable,true),
      isNotNull(schema.users.handle),
      bounds ? and(
        gte(schema.users.locationLat,bounds.minLat),
        lte(schema.users.locationLat,bounds.maxLat),
        gte(schema.users.locationLng,bounds.minLng),
        lte(schema.users.locationLng,bounds.maxLng),
      ) : undefined,
    )),
    hiddenFrom(userId),
    db
      .select({ trainerUserId: schema.subscribers.trainerUserId })
      .from(schema.subscribers)
      .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt))),
    // Pending asks at gated coaches, so their rows can say Requested rather
    // than offering a Follow that would double-file the ask.
    db
      .select({ trainerUserId: schema.followRequests.trainerUserId })
      .from(schema.followRequests)
      .where(eq(schema.followRequests.requesterUserId, userId)),
  ]);
  const rows = everyone.filter((r) => !hidden.has(r.id));

  // Their own classes plus the shifts each has chosen to show, so the count
  // matches what opening their page actually shows.
  const classRows = (await publicSchedules(rows)).filter((c) => c.isPublic);

  // "Classes this week": the signal that a page is actually live, and the
  // thing somebody is deciding on.
  const start = new Date(`${todayIso()}T00:00:00Z`);
  const weekCount = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dow = (d.getUTCDay() + 6) % 7;
    for (const c of classRows) {
      if (runsOn(c, iso, dow)) {
        weekCount.set(c.ownerUserId, (weekCount.get(c.ownerUserId) ?? 0) + 1);
      }
    }
  }
  const following = new Set(followRows.map((r) => r.trainerUserId));
  const requested = new Set(askRows.map((r) => r.trainerUserId));
  const joinedAt = new Map(rows.map((r) => [r.id, r.createdAt?.getTime() ?? 0]));

  // The soonest class per coach, for People near you's rows: "Today 6:00p".
  // A fortnight is far enough; a coach with nothing in it gets no line.
  const soonest = new Map<string, string>();
  for (let i = 0; i < 14; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dow = (d.getUTCDay() + 6) % 7;
    for (const c of classRows) {
      if (soonest.has(c.ownerUserId)) continue;
      if (!runsOn(c, iso, dow)) continue;
      if (occurrenceEnded(iso, c.startTime, c.durationMin, c.timeZone)) continue;
      const t = clockParts(c.startTime);
      const day =
        i === 0
          ? "Today"
          : d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
      soonest.set(c.ownerUserId, `${day} ${t.hm}${t.ap.toLowerCase()}`);
    }
  }

  const people: DirPerson[] = rows
    // The quality bar is a coach's: their page has to be worth opening (a
    // schedule, or enough profile). A member's row is just the person, which
    // is all it claims to be.
    .filter((r) => !!r.name.trim() && !!(weekCount.get(r.id) || r.title?.trim() || r.about?.trim()))
    .filter((r) => r.id !== userId)
    .map((r) => ({
      id: r.id,
      handle: r.handle!,
      name: r.name,
      kind: "coach" as const,
      photo: r.photo,
      title: r.title ?? "",
      location: r.location?.trim() ?? "",
      lat: r.locationLat,
      lng: r.locationLng,
      classesThisWeek: weekCount.get(r.id) ?? 0,
      following: following.has(r.id),
      requested: requested.has(r.id),
      availability: r.availability,
      disciplines: r.disciplines,
      color: avatarColor(r),
      next: soonest.get(r.id) ?? null,
    }))
    // Newest first: the list doubles as "who just joined", and the fresh face
    // at the top is the reason to keep opening it.
    .sort((a, b) => (joinedAt.get(b.id) ?? 0) - (joinedAt.get(a.id) ?? 0));

  const cities = [...new Set(people.map((c) => c.location).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );

  return { people, cities, myCity: me.location?.trim() || null, myLat:me.locationLat, myLng:me.locationLng };
}

export type BrowseDay = {
  iso: string;
  label: string;
  items: {
    classId: string;
    base: string;
    iso: string;
    name: string;
    hm: string;
    ap: string;
    durationMin: number;
    classType: string | null;
    lat: number | null;
    lng: number | null;
    where: string | null;
    coachName: string;
    coachPhoto: string | null;
    coachColor: string;
    attribution: "coached" | "added";
    attributionName: string;
    /** Yours to teach, so there is nothing to save. */
    own: boolean;
    saved: boolean;
  }[];
};

export type AddBrowseData = {
  days: BrowseDay[];
  myLat: number | null;
  myLng: number | null;
};

export async function discoverStudios(distanceMiles?: number, center?: { lat:number; lng:number }): Promise<DirStudio[]> {
  const me = await currentUser();
  if (!me) return [];
  const db = await getDb();
  const bounds = nearBounds(center?.lat ?? me.locationLat, center?.lng ?? me.locationLng, distanceMiles);
  const [studios, favoriteRows] = await Promise.all([
    db.select({
      id:schema.studios.id, slug:schema.studios.slug, name:schema.studios.name,
      address:schema.studios.address, placeKind:schema.studios.placeKind,
      lat:schema.studios.lat, lng:schema.studios.lng, photo:schema.studios.photo,
      types:schema.studios.types, accountUserId:schema.studios.accountUserId,
    }).from(schema.studios).where(bounds ? and(
      gte(schema.studios.lat,bounds.minLat), lte(schema.studios.lat,bounds.maxLat),
      gte(schema.studios.lng,bounds.minLng), lte(schema.studios.lng,bounds.maxLng),
    ) : undefined).orderBy(schema.studios.name),
    db.select({ studioId:schema.studioEndorsements.targetStudioId }).from(schema.studioEndorsements).where(and(eq(schema.studioEndorsements.endorserUserId, me.id), eq(schema.studioEndorsements.trait, "been_here"))),
  ]);
  const favorites = new Set(favoriteRows.map((row) => row.studioId));
  return studios.map((studio) => ({
    id:studio.id, slug:studio.slug ?? studio.id, name:studio.name, address:studio.address, placeKind:studio.placeKind,
    lat:studio.lat, lng:studio.lng,
    photo:studio.photo, types:studio.types, hasSchedule:!!studio.accountUserId,
    color:avatarColor({ id:studio.id }), favorited:favorites.has(studio.id),
  }));
}

export async function discoverGroups(distanceMiles?: number, center?: { lat:number; lng:number }) {
  const me = await currentUser();
  if (!me) return [];
  const db = await getDb();
  const bounds = nearBounds(center?.lat ?? me.locationLat, center?.lng ?? me.locationLng, distanceMiles);
  const [groups, favoriteRows, hidden] = await Promise.all([db
    .select({
      id:schema.groups.id,
      ownerUserId:schema.groups.ownerUserId,
      name:schema.groups.name,
      slug:schema.groups.slug,
      description:schema.groups.description,
      purpose:schema.groups.purpose,
      lat:schema.users.locationLat,
      lng:schema.users.locationLng,
    })
    .from(schema.groups)
    .innerJoin(schema.users, eq(schema.groups.ownerUserId, schema.users.id))
    .where(and(
      eq(schema.groups.visibility, "public"),
      bounds ? and(
        gte(schema.users.locationLat,bounds.minLat), lte(schema.users.locationLat,bounds.maxLat),
        gte(schema.users.locationLng,bounds.minLng), lte(schema.users.locationLng,bounds.maxLng),
      ) : undefined,
    )),
  db.select({ groupId:schema.groupFavorites.groupId })
    .from(schema.groupFavorites)
    .where(eq(schema.groupFavorites.userId, me.id)),
  hiddenFrom(me.id),
  ]);
  const favorites = new Set(favoriteRows.map((row) => row.groupId));
  return groups
    .filter((group) => !hidden.has(group.ownerUserId))
    .map(({ ownerUserId: _ownerUserId, ...group }) => ({ ...group, favorited:favorites.has(group.id) }));
}

/**
 * The Add screen's browse list: the same feed Discover draws, the next
 * seven days of it, with the viewer's saved state on every row so the
 * ribbons start right. One builder behind both (buildDiscoverFeed), so
 * Add can never offer a class Discover would not.
 */
export async function addBrowse(): Promise<AddBrowseData | null> {
  const me = await currentUser();
  if (!me) return null;
  const userId = me.id;
  const db = await getDb();
  const { buildDiscoverFeed } = await import("@/lib/discoverfeed");
  const { fmtDayHeaderRel } = await import("@/lib/format");
  const feed = await buildDiscoverFeed(userId, me);
  const last = new Date(Date.parse(`${feed.today}T00:00:00Z`) + 6 * 864e5)
    .toISOString()
    .slice(0, 10);
  const marks = await db
    .select({ classId: schema.attendances.classId, iso: schema.attendances.occurrenceDate })
    .from(schema.attendances)
    .where(eq(schema.attendances.userId, userId));
  const saved = new Set(marks.map((m) => `${m.classId}|${m.iso}`));
  const coachName = new Map(feed.rail.map((c) => [c.id, c.name]));
  const coachPhoto = new Map(feed.rail.map((c) => [c.id, c.photo]));
  const coachColor = new Map(feed.rail.map((c) => [c.id, c.color]));
  const byIso = new Map<string, BrowseDay["items"]>();
  for (const i of feed.items) {
    if (i.iso > last) continue;
    byIso.set(i.iso, [
      ...(byIso.get(i.iso) ?? []),
      {
        classId: i.classId,
        base: i.base,
        iso: i.iso,
        name: i.name,
        hm: i.hm,
        ap: i.ap,
        durationMin: i.durationMin,
        classType: i.classType,
        lat: i.lat,
        lng: i.lng,
        where: i.where,
        coachName: coachName.get(i.coachId) ?? "",
        coachPhoto: coachPhoto.get(i.coachId) ?? null,
        coachColor: coachColor.get(i.coachId) ?? avatarColor({ id:i.coachId }),
        attribution: "coached",
        attributionName: coachName.get(i.coachId) ?? "",
        own: i.coachId === userId,
        saved: saved.has(`${i.classId}|${i.iso}`),
      },
    ]);
  }
  return {
    days: [...byIso.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([iso, items]) => ({ iso, label: fmtDayHeaderRel(iso, feed.today), items })),
    myLat: me.locationLat,
    myLng: me.locationLng,
  };
}
