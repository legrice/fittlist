import { and, eq, gte, inArray, isNotNull, isNull, lte, max, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { hiddenFrom } from "@/lib/blocks";
import { classAddress, publicFeedSchedules } from "@/lib/coachweek";
import { clockParts, occurrenceEnded, runsOn, timeToMinutes, todayIso } from "@/lib/format";
import type {
  FeedCoach,
  FeedItem,
  NearStudio,
  RailPerson,
} from "@/components/FollowingScreen";

// The Discover feed, built once for everything that shows it: the tab's
// page, and the Add screen's browse list. Classes near you from every
// listable coach, deduped to one row per class, with the favorites rail
// and the category pills derived from the same pass.

export type DiscoverFeed = {
  items: FeedItem[];
  /** Every listable coach with their soonest class, for naming rows and the
   *  Add screen's browse list. Not the rail: the rail is `myRail`. */
  rail: FeedCoach[];
  favIds: string[];
  cats: string[];
  follows: number;
  today: string;
  /** The This week rail: every coach you follow, each carrying the freshness
   *  ring's state. Coaches with something coming up lead; empty weeks remain
   *  visible at the end. */
  myRail: RailPerson[];
  /** The rails under the schedule: every studio, the viewer's city first,
   *  and every listable coach with the viewer's follow state riding along. */
  nearStudios: NearStudio[];
};

/** How far ahead a face has to have something for the rail to carry it:
 *  the peek's own fortnight, so a circle never opens onto nothing. */
const RAIL_AHEAD_DAYS = 14;

export async function buildDiscoverFeed(
  userId: string,
  me: { email: string; kind: string; handle: string | null; location?: string | null },
): Promise<DiscoverFeed> {
  const db = await getDb();
  // By email, the way every other follow lookup does it: somebody who followed
  // before signing in still counts once the address has an account.
  const [followRows, hidden] = await Promise.all([
    db
      .select({
        trainerUserId: schema.subscribers.trainerUserId,
        peekedAt: schema.subscribers.peekedAt,
      })
      .from(schema.subscribers)
      .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt))),
    hiddenFrom(userId),
  ]);
  const followed = followRows
    .map((r) => r.trainerUserId)
    .filter((id) => id !== userId && !hidden.has(id));
  const followedSet = new Set(followed);
  const today = todayIso();
  const throughDate = new Date(`${today}T00:00:00Z`);
  throughDate.setUTCDate(throughDate.getUTCDate() + 30);
  const through = throughDate.toISOString().slice(0, 10);
  // Discover, per the brief: the list is classes near you, from every
  // listable coach, whether or not anybody favorited them. A favorite is a
  // shortcut to a person (the rail on top), not a subscription that fills
  // this feed; the feed is full on day one because it never waited on one.
  // Delisted (discoverable off) and blocked stay out; your own classes ride
  // along because they are also near you, and true.
  // These reads do not depend on one another. With a broad follow graph they
  // used to form a long waterfall around schedule loading; start them as one
  // batch and project only the fields this list actually serializes.
  const userListColumns = {
    id: schema.users.id,
    kind: schema.users.kind,
    email: schema.users.email,
    name: schema.users.name,
    handle: schema.users.handle,
    location: schema.users.location,
    // Return exactly one image value. Selecting both the original data URL
    // and its thumbnail made the DB ship the large original even though the
    // list immediately discarded it whenever a thumbnail existed.
    photo: sql<null>`null`,
    photoThumb: sql<string | null>`coalesce(${schema.users.photoThumb}, ${schema.users.photo})`,
    shiftsPublic: schema.users.shiftsPublic,
    avatarColor: schema.users.avatarColor,
  };
  const studioListColumns = {
    id: schema.studios.id,
    slug: schema.studios.slug,
    name: schema.studios.name,
    address: schema.studios.address,
    photo: schema.studios.photo,
    types: schema.studios.types,
    lat: schema.studios.lat,
    lng: schema.studios.lng,
  };
  const [everyoneRows, followedUsers, mineMarkRows, activityRows, allStudios] = await Promise.all([
    db
      .select(userListColumns)
      .from(schema.users)
      .where(and(isNotNull(schema.users.handle), eq(schema.users.discoverable, true))),
    followed.length
      ? db.select(userListColumns).from(schema.users).where(inArray(schema.users.id, followed))
      : Promise.resolve([]),
    // Only marks inside the rendered rolling range can affect this payload.
    // Avoid carrying years of a frequent user's attendance history on every
    // calendar visit.
    db
      .select({
        classId: schema.attendances.classId,
        occurrenceDate: schema.attendances.occurrenceDate,
      })
      .from(schema.attendances)
      .where(and(
        eq(schema.attendances.userId, userId),
        gte(schema.attendances.occurrenceDate, today),
        lte(schema.attendances.occurrenceDate, through),
      )),
    followed.length
      ? db
          .select({
            userId: schema.classes.userId,
            createdAt: max(schema.classes.createdAt),
          })
          .from(schema.classes)
          .where(and(inArray(schema.classes.userId, followed), eq(schema.classes.isPublic, true)))
          .groupBy(schema.classes.userId)
      : Promise.resolve([]),
    db.select(studioListColumns).from(schema.studios).orderBy(schema.studios.name),
  ]);
  const coachRows = everyoneRows.filter(
    (u) => u.kind !== "fan" && u.kind !== "gym" && (u.id === userId || !hidden.has(u.id)),
  );
  const followedCoaches = followedUsers.filter(
    (u) => u.kind !== "fan" && u.kind !== "gym" && !!u.handle,
  );
  const directoryCoachIds = new Set(coachRows.map((coach) => coach.id));
  const missingFollowedCoaches = followedCoaches.filter((coach) => !directoryCoachIds.has(coach.id));
  // The same loader the coach's own page and the digests ask, so following
  // somebody shows the week their page shows and not a shorter one.
  // Followed, discoverable coaches are already in the directory schedule
  // result. Reusing those rows avoids loading the same classes, shifts and
  // cover exceptions twice (the old path did exactly that for all 90 follows).
  const [allClassRows, missingFollowedSchedules] = await Promise.all([
    coachRows.length ? publicFeedSchedules(coachRows) : Promise.resolve([]),
    missingFollowedCoaches.length
      ? publicFeedSchedules(missingFollowedCoaches)
      : Promise.resolve([]),
  ]);
  const classRows = allClassRows.filter((c) => c.isPublic);
  const coaches = coachRows.filter((c) => !!c.handle);
  const coachById = new Map(coaches.map((c) => [c.id, c]));
  const studioById = new Map(allStudios.map((s) => [s.id, s]));

  // What the viewer already saved, so the row ribbons start right.
  const mineMarks = new Set(
    mineMarkRows.map((m) => `${m.classId}|${m.occurrenceDate}`),
  );
  const items: FeedItem[] = [];
  for (let n = 0; n <= 30; n++) {
    const occurrenceDate = new Date(`${today}T00:00:00Z`);
    occurrenceDate.setUTCDate(occurrenceDate.getUTCDate() + n);
    const iso = occurrenceDate.toISOString().slice(0, 10);
    const w = Math.floor(n / 7);
    const d = new Date(`${iso}T00:00:00Z`);
    const dow = (d.getUTCDay() + 6) % 7;
    for (const c of classRows) {
      if (!runsOn(c, iso, dow)) continue;
      // Been and gone is not an answer to "when can I train next".
      if (occurrenceEnded(iso, c.startTime, c.durationMin)) continue;
      // A shift is owned by the gym and shown under the coach, so the person
      // this row is about is ownerUserId, never userId.
      const coach = coachById.get(c.ownerUserId);
      if (!coach?.handle) continue;
      const st = c.studioId ? studioById.get(c.studioId) : undefined;
      const at = classAddress(c, coach.handle, st?.slug);
      if (!at) continue;
      const t = clockParts(c.startTime);
      items.push({
        key: `${c.id}|${iso}`,
        week: w,
        iso,
        classId: c.id,
        base: at.key,
        coachId: coach.id,
        name: c.name,
        where: st?.name ?? c.location ?? null,
        // A studio has a page; a class's own free-text location names a
        // room, which has nothing to open.
        whereHref: st ? `/s/${st.slug}` : null,
        hm: t.hm,
        ap: t.ap,
        durationMin: c.durationMin,
        mins: timeToMinutes(c.startTime),
        about: c.description ?? null,
        classType: c.classType ?? null,
        links: c.links,
        studioAddress: st?.address ?? null,
        // The studio's coordinates, for the distance filter: geocoded at
        // save, best-effort, null when the lookup missed. A class with no
        // coordinates passes any distance rather than vanishing.
        lat: st?.lat ?? null,
        lng: st?.lng ?? null,
        saved: mineMarks.has(`${c.id}|${iso}`),
      });
    }
  }
  // One class, one row, however many accounts list it. A studio's listing
  // and the coach's own, or two coaches co-listing a slot, are the same
  // class in the reader's terms: same name, same start, same place, same
  // day. Discover is a reader's list, so the duplicate collapses here and
  // the first row in wins (the loop walks coaches in a stable order). The
  // pairing publicSchedules does covers gym-vs-coach per person; this is
  // the reader-side net for everything that slips past it.
  {
    const seen = new Set<string>();
    let w = 0;
    for (const i of items) {
      const key = `${i.iso}|${i.name.trim().toLowerCase()}|${i.mins}|${(i.where ?? "").toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items[w++] = i;
    }
    items.length = w;
  }

  // Soonest first. The rail was alphabetical, which is an order about the
  // names rather than about the week: whoever is teaching in an hour was
  // wherever the alphabet put them, and a rail is read left to right with only
  // its first few faces seen without a swipe. So the face in front is the one
  // with the nearest class, and the question "who can I train with next" is
  // answered by the order itself.
  //
  // Keyed on the date and the time together, because `mins` alone would put
  // next Monday's 6am ahead of tonight's 6pm. A coach with nothing in the
  // three weeks sorts last and is dropped by the rail anyway; they keep the
  // alphabet among themselves so the tail is at least stable.
  const soonest = new Map<string, string>();
  const soonestItem = new Map<string, FeedItem>();
  for (const i of items) {
    const at = `${i.iso}T${String(i.mins).padStart(4, "0")}`;
    const had = soonest.get(i.coachId);
    if (!had || at < had) {
      soonest.set(i.coachId, at);
      soonestItem.set(i.coachId, i);
    }
  }
  // The rail is the favorites alone, soonest class first, each face
  // carrying when that class is: the rail answers "who can I train with
  // next" before a single tap.
  const favSet = new Set(followed);
  const nextLabel = (id: string): string | null => {
    const item = soonestItem.get(id);
    if (!item) return null;
    const iso = item.iso;
    const day =
      iso === today
        ? "Today"
        : new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
            weekday: "short",
            timeZone: "UTC",
          });
    return `${day} ${item.hm}${item.ap.toLowerCase()}`;
  };
  const rail: FeedCoach[] = coaches
    .map((c) => ({
      id: c.id,
      name: c.name.trim() || c.email.split("@")[0],
      handle: c.handle!,
      photo: c.photoThumb ?? c.photo,
      color: avatarColor(c),
      next: nextLabel(c.id),
    }))
    .sort((a, b) => {
      const x = soonest.get(a.id);
      const y = soonest.get(b.id);
      if (x && y && x !== y) return x < y ? -1 : 1;
      if (x && !y) return -1;
      if (!x && y) return 1;
      return a.name.localeCompare(b.name);
    });

  // The category pills, from what the rolling month actually holds: a filter is
  // only offered where it can narrow something.
  const catCount = new Map<string, number>();
  for (const i of items) if (i.classType) catCount.set(i.classType, (catCount.get(i.classType) ?? 0) + 1);
  const cats = [...catCount.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);

  // The This Week rail is the followed-coach relationship itself, not a list
  // of schedules that happen to be populated today. Coaches teaching soonest
  // lead; an empty week moves to the tail rather than making the coach
  // disappear. Members stay out: a large personal follow graph overwhelms
  // the useful shortcut to coaching calendars.
  const peekedByTrainer = new Map(followRows.map((r) => [r.trainerUserId, r.peekedAt]));
  const theirSchedules = [
    ...allClassRows.filter((row) => followedSet.has(row.ownerUserId)),
    ...missingFollowedSchedules,
  ];
  const activityAt = new Map<string, number>();
  for (const r of activityRows) {
    const at = r.createdAt ? new Date(r.createdAt).getTime() : 0;
    if (at > (activityAt.get(r.userId) ?? 0)) activityAt.set(r.userId, at);
  }
  // When their next teaching occurrence is. No entry means they sort after
  // everyone with an active week.
  const nextAt = new Map<string, string>();
  const consider = (userId: string, at: string) => {
    const had = nextAt.get(userId);
    if (!had || at < had) nextAt.set(userId, at);
  };
  const publicTheirs = theirSchedules.filter((c) => c.isPublic);
  for (let n = 0; n < RAIL_AHEAD_DAYS; n++) {
    const d = new Date(Date.parse(`${today}T00:00:00Z`) + n * 864e5);
    const iso = d.toISOString().slice(0, 10);
    const dow = (d.getUTCDay() + 6) % 7;
    for (const c of publicTheirs) {
      if (nextAt.has(c.ownerUserId)) continue;
      if (!runsOn(c, iso, dow)) continue;
      if (occurrenceEnded(iso, c.startTime, c.durationMin)) continue;
      consider(c.ownerUserId, `${iso}T${String(timeToMinutes(c.startTime)).padStart(4, "0")}`);
    }
  }
  const myRail: RailPerson[] = followedCoaches
    .map((u) => {
      const peeked = peekedByTrainer.get(u.id)?.getTime() ?? 0;
      return {
        id: u.id,
        name: u.name.trim() || u.email.split("@")[0],
        handle: u.handle,
        photo: u.photoThumb ?? u.photo,
        color: avatarColor(u),
        fresh: (activityAt.get(u.id) ?? 0) > peeked,
        nextAt: nextAt.get(u.id) ?? null,
      };
    })
    .sort((a, b) => {
      if (a.nextAt && b.nextAt && a.nextAt !== b.nextAt) return a.nextAt < b.nextAt ? -1 : 1;
      if (a.nextAt && !b.nextAt) return -1;
      if (!a.nextAt && b.nextAt) return 1;
      return a.name.localeCompare(b.name);
    });

  // Studios near you: every studio in the directory, the viewer's own city
  // leading. "Closest" without asking for a pin on arrival: the city on
  // their account is the honest first cut, and the screen re-sorts by real
  // distance once the distance filter has already earned geolocation.
  const myCity = (me.location ?? "").split(",")[0].trim().toLowerCase();
  // Closest first without asking anybody for a pin, by Matt's call: the
  // viewer's city has a centre we can honestly guess (the average of its
  // own pinned studios), and distance from it beats the alphabet. The
  // client still re-sorts by the real pin when the browser has one.
  const withLocal = allStudios.map((s) => ({
    s,
    local: !!myCity && s.address.toLowerCase().includes(myCity),
  }));
  const pinsHome = withLocal.filter((x) => x.local && x.s.lat != null && x.s.lng != null);
  const center = pinsHome.length
    ? {
        lat: pinsHome.reduce((t, x) => t + x.s.lat!, 0) / pinsHome.length,
        lng: pinsHome.reduce((t, x) => t + x.s.lng!, 0) / pinsHome.length,
      }
    : null;
  const rad = (x: number) => (x * Math.PI) / 180;
  const milesFromCenter = (lat: number | null, lng: number | null): number => {
    if (!center || lat == null || lng == null) return Number.MAX_SAFE_INTEGER;
    const dLat = rad(lat - center.lat);
    const dLng = rad(lng - center.lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(center.lat)) * Math.cos(rad(lat)) * Math.sin(dLng / 2) ** 2;
    return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };
  // A daily, deterministic shuffle: the rail feels assorted rather than
  // alphabetical, but it does not jump around during a visit or hydrate in a
  // different order on the client. Photos lead because they make the rail
  // useful while the studio library is still being filled in.
  const shuffleRank = (id: string) => {
    let hash = 2166136261;
    for (const ch of `${today}|${id}`) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
    return hash >>> 0;
  };
  const nearStudios: NearStudio[] = withLocal
    .map(({ s, local }) => ({
      id: s.id,
      slug: s.slug ?? s.id,
      name: s.name,
      photo: s.photo,
      color: avatarColor({ id: s.id }),
      types: s.types,
      lat: s.lat ?? null,
      lng: s.lng ?? null,
      approxMiles:
        center && s.lat != null && s.lng != null ? milesFromCenter(s.lat, s.lng) : null,
      local,
    }))
    // Image first, then local relevance, then the stable daily shuffle.
    .sort(
      (a, b) =>
        Number(!!b.photo) - Number(!!a.photo) ||
        Number(b.local) - Number(a.local) ||
        shuffleRank(a.id) - shuffleRank(b.id),
    );

  // Coaches near you: every listable coach, your city first, then whoever
  // teaches soonest, with the viewer's follow state riding along so the
  // pill under each face starts right.
  return {
    items,
    rail,
    favIds: [...favSet],
    cats,
    follows: followedCoaches.length,
    today,
    myRail,
    nearStudios,
  };
}
