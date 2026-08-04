import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { hiddenFrom } from "@/lib/blocks";
import { classAddress } from "@/lib/coachweek";
import { clockParts, fmtDayHeader, todayIso } from "@/lib/format";

// Activity: what the people you follow did lately.
//
// This was the bottom section of the Home screen, which is parked. The feed
// outlived it, so it moved here rather than going with it: /activity is a
// page of its own behind the header's heartbeat. The Home spec that described
// it stays in homescreenspec.md for whenever Home comes back.
//
// The rules that matter are all inherited and none of them are cosmetic: only
// public acts reach it (a Going mark is public by default, and a personal row
// has no column that could make one public), it is grouped by seriesId so a
// weekly class counts once, and coach posts lead because a coach putting next
// week up is the one thing here that regenerates without the follow graph
// growing.

type UserRow = typeof schema.users.$inferSelect;

export type ActivityItem = {
  key: string;
  actorName: string;
  actorPhoto: string | null;
  actorColor: string;
  title: string;
  sub: string;
  href: string;
};

const ACTIVITY_CAP = 8;
const ACTIVITY_LOOKBACK_DAYS = 7;
/** How far forward a going row can sit. Home's Upcoming used the same number
 *  and it stays, so "is going to" spans what it always did. */
const UPCOMING_DAYS = 7;

/** The feed, newest first, coach posts ahead of attendance. */
/** "yesterday", "3 days ago": the relative day a went-to row reads. */
function agoWord(iso: string, today: string): string {
  const days = Math.round(
    (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${iso}T00:00:00Z`).getTime()) / 86400000,
  );
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** "Wed" for a date this week, the bare header otherwise; Today and
 *  Tomorrow keep their words. */
function fmtDayHeaderRelShort(iso: string, today: string): string {
  const days = Math.round(
    (new Date(`${iso}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000,
  );
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7)
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  return fmtDayHeader(iso);
}

export async function activityFeed(me: UserRow, cap = ACTIVITY_CAP): Promise<ActivityItem[]> {
  const db = await getDb();
  const today = todayIso();
  const [followRows, hidden] = await Promise.all([
    db
      .select({ trainerUserId: schema.subscribers.trainerUserId })
      .from(schema.subscribers)
      .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt))),
    hiddenFrom(me.id),
  ]);
  const followed = followRows
    .map((r) => r.trainerUserId)
    .filter((id) => id !== me.id && !hidden.has(id));
  const followedSet = new Set(followed);
  if (!followed.length) return [];

  // The window a going row can fall in: a week back for "went to", and the
  // same week forward that Upcoming covers for "is going to".
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + UPCOMING_DAYS - 1);
  const endIso = end.toISOString().slice(0, 10);
  // The studios a row names, and every public class, which is what tells a
  // studio somebody has just started teaching at from one they always had.
  const [studioRows, publicClasses] = await Promise.all([
    db.select().from(schema.studios),
    db.select().from(schema.classes).where(eq(schema.classes.isPublic, true)),
  ]);
  const studioById = new Map(studioRows.map((st) => [st.id, st]));

  const since = new Date(Date.now() - ACTIVITY_LOOKBACK_DAYS * 86400000);
  const wentFloor = new Date(`${today}T00:00:00Z`);
  wentFloor.setUTCDate(wentFloor.getUTCDate() - ACTIVITY_LOOKBACK_DAYS);
  const wentFloorIso = wentFloor.toISOString().slice(0, 10);
  const [goingActs, addedClasses, newLinks] = await Promise.all([
    // Public marks, a week back to a week out: the future ones are
    // "is going to", the passed ones "went to".
    db
      .select()
      .from(schema.attendances)
      .where(
        and(
          inArray(schema.attendances.userId, followed),
          eq(schema.attendances.isPublic, true),
          gte(schema.attendances.occurrenceDate, wentFloorIso),
          lte(schema.attendances.occurrenceDate, endIso),
        ),
      ),
    // "Sarah added 4 classes": their classes, grouped, this fortnight.
    db
      .select()
      .from(schema.classes)
      .where(
        and(
          inArray(schema.classes.userId, followed),
          eq(schema.classes.isPublic, true),
          gte(schema.classes.createdAt, since),
        ),
      ),
    // "Erin now teaches at CULTR": a fresh Where-I-coach link.
    db
      .select()
      .from(schema.coachStudios)
      .where(and(inArray(schema.coachStudios.userId, followed), gte(schema.coachStudios.createdAt, since))),
  ]);
  const actorIds = [
    ...new Set([
      ...goingActs.map((a) => a.userId),
      ...addedClasses.map((c) => c.userId),
      ...newLinks.map((l) => l.userId),
    ]),
  ];
  const actors = actorIds.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, actorIds))
    : [];
  const actorById = new Map(actors.map((a) => [a.id, a]));
  const goingClassIds = [...new Set(goingActs.map((a) => a.classId))];
  const goingClasses = goingClassIds.length
    ? await db.select().from(schema.classes).where(inArray(schema.classes.id, goingClassIds))
    : [];
  const goingClassById = new Map(goingClasses.map((c) => [c.id, c]));
  const goingOwnerIds = [...new Set(goingClasses.map((c) => c.userId))].filter(
    (id) => !actorById.has(id),
  );
  const goingOwners = goingOwnerIds.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, goingOwnerIds))
    : [];
  for (const o of goingOwners) actorById.set(o.id, o);

  type Cand = ActivityItem & { at: number };
  // Coach posts lead and attendance follows, each newest first: a coach
  // putting next week up is the one thing here that regenerates without
  // any growth in the follow graph, and it is the literal reason someone
  // opens the app (did my coach post yet).
  const coachCands: Cand[] = [];
  const personCands: Cand[] = [];
  for (const a of goingActs) {
    const actor = actorById.get(a.userId);
    const c = goingClassById.get(a.classId);
    if (!actor || !c) continue;
    const owner = actorById.get(c.userId);
    const studio = c.studioId ? studioById.get(c.studioId) : undefined;
    const base =
      owner?.kind === "gym" ? (studio?.slug ? `s/${studio.slug}` : null) : (owner?.handle ?? null);
    const t = clockParts(c.startTime);
    const first = actor.name.split(" ")[0] || actor.name;
    const past = a.occurrenceDate < today;
    const others = goingActs.filter(
      (x) => x.classId === a.classId && x.occurrenceDate === a.occurrenceDate && x.userId !== a.userId,
    ).length;
    personCands.push({
      key: `g-${a.id}`,
      actorName: actor.name,
      actorPhoto: actor.photo,
      actorColor: avatarColor(actor),
      title: past ? `${first} went to ${c.name}` : `${first} is going to ${c.name}`,
      sub: past
        ? [studio?.name || c.location || "", agoWord(a.occurrenceDate, today)]
            .filter(Boolean)
            .join(" · ")
        : [
            `${fmtDayHeaderRelShort(a.occurrenceDate, today)} ${t.hm} ${t.ap}`,
            studio?.name || c.location || "",
            others ? `with ${others} ${others === 1 ? "other" : "others"}` : "",
          ]
            .filter(Boolean)
            .join(" · "),
      href: base ? `/${base}/${c.id}?d=${a.occurrenceDate}&from=home` : "#",
      at: a.createdAt.getTime(),
    });
  }
  // One row per coach for a batch of added classes, not one per class
  // row: a weekly class is one row per weekday sharing a seriesId, and
  // "added 7 classes" for one Monday-to-Sunday class would be a lie.
  // A real batch reads as the schedule going up ("posted next week"); a
  // class or two reads as an addition, and a studio they have not taught
  // at before is the interesting part, so it leads the line.
  const byOwner = new Map<string, { series: Set<string>; latest: number; studios: Set<string>; newStudio?: string }>();
  // Where each coach already taught, before this window: the flag for a
  // new location has to know what was there first.
  const oldStudios = new Map<string, Set<string>>();
  for (const c of publicClasses) {
    if (c.createdAt >= since) continue;
    if (!c.studioId) continue;
    const set = oldStudios.get(c.userId) ?? new Set<string>();
    set.add(c.studioId);
    oldStudios.set(c.userId, set);
  }
  for (const c of addedClasses) {
    const cur =
      byOwner.get(c.userId) ?? { series: new Set<string>(), latest: 0, studios: new Set<string>() };
    cur.series.add(c.seriesId);
    cur.latest = Math.max(cur.latest, c.createdAt.getTime());
    const s = c.studioId ? studioById.get(c.studioId) : undefined;
    if (s) {
      cur.studios.add(s.name);
      if (!oldStudios.get(c.userId)?.has(s.id)) cur.newStudio = s.name;
    }
    byOwner.set(c.userId, cur);
  }
  for (const [ownerId, agg] of byOwner) {
    const actor = actorById.get(ownerId);
    if (!actor || actor.kind === "fan" || !actor.handle) continue;
    const n = agg.series.size;
    const first = actor.name.split(" ")[0] || actor.name;
    const studioList = [...agg.studios];
    const places =
      studioList.length > 2
        ? `${studioList.slice(0, 2).join(", ")} and ${studioList.length - 2} more`
        : studioList.join(" and ");
    const batch = n >= 3;
    coachCands.push({
      key: `c-${ownerId}`,
      actorName: actor.name,
      actorPhoto: actor.photo,
      actorColor: avatarColor(actor),
      title: batch
        ? `${first} posted next week`
        : `${first} added ${n === 1 ? "a class" : `${n} classes`}`,
      sub: batch
        ? [`${n} classes${places ? ` at ${places}` : ""}`].join("")
        : [agg.newStudio ? `New studio: ${agg.newStudio}` : studioList[0], "this week"]
            .filter(Boolean)
            .join(" · "),
      href: `/${actor.handle}?from=home`,
      at: agg.latest,
    });
  }
  for (const l of newLinks) {
    const actor = actorById.get(l.userId);
    const studio = studioById.get(l.studioId);
    if (!actor || !studio || !actor.handle) continue;
    coachCands.push({
      key: `s-${l.userId}-${l.studioId}`,
      actorName: actor.name,
      actorPhoto: actor.photo,
      actorColor: avatarColor(actor),
      title: `${actor.name.split(" ")[0] || actor.name} now teaches at ${studio.name}`,
      sub: studio.address,
      href: `/s/${studio.slug ?? studio.id}?from=home`,
      at: l.createdAt.getTime(),
    });
  }
  coachCands.sort((a, b) => b.at - a.at);
  personCands.sort((a, b) => b.at - a.at);
  return [...coachCands, ...personCands].slice(0, cap).map(({ at: _at, ...rest }) => rest);
}
