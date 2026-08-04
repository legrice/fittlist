import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { hiddenFrom } from "@/lib/blocks";
import { classAddress, publicSchedules } from "@/lib/coachweek";
import { clockParts, fmtDayHeader, occurrenceEnded, runsOn, todayIso } from "@/lib/format";

// The Home tab's one loader. Home is a mixed scroll that has something new
// on it whether or not your follow graph changed: your own next seven days
// of Going marks, the people and places near you, and what the people you
// follow are up to. It is a finite page that ends, chronological where it
// is a list of times and nothing algorithmic anywhere: proximity is the
// location string, recency is createdAt, and that is the whole ranking.

export type HomeUpcoming = {
  classId: string;
  /** The URL base the class page lives under: a handle, or s/{slug}. */
  base: string;
  iso: string;
  /** "Today", "Tomorrow", then the weekday. */
  dayLabel: string;
  time: string;
  name: string;
  coachName: string | null;
  coachPhoto: string | null;
  coachColor: string;
  where: string | null;
  durationMin: number;
  href: string;
  /** People you follow, going to the same one; public marks only. */
  alsoGoing: string[];
};

export type HomePerson = {
  id: string;
  handle: string;
  name: string;
  photo: string | null;
  color: string;
  kind: "coach" | "member";
  sub: string;
};

export type HomeStudio = {
  id: string;
  slug: string;
  name: string;
  photo: string | null;
  color: string;
  verified: boolean;
  sub: string;
};

export type HomeActivity = {
  key: string;
  actorName: string;
  actorPhoto: string | null;
  actorColor: string;
  title: string;
  sub: string;
  href: string;
};

export type HomeData = {
  location: string | null;
  todayLabel: string;
  upcoming: HomeUpcoming[];
  people: HomePerson[];
  studios: HomeStudio[];
  activity: HomeActivity[];
};

type UserRow = typeof schema.users.$inferSelect;

const UPCOMING_DAYS = 7;
const PEOPLE_CAP = 12;
const STUDIO_CAP = 3;
const ACTIVITY_CAP = 8;
// A week, because the rows say "this week" and the words have to be true.
const ACTIVITY_LOOKBACK_DAYS = 7;

export async function homeData(me: UserRow): Promise<HomeData> {
  const db = await getDb();
  const today = todayIso();

  const [followRows, hidden, myMarks] = await Promise.all([
    db
      .select({ trainerUserId: schema.subscribers.trainerUserId })
      .from(schema.subscribers)
      .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt))),
    hiddenFrom(me.id),
    db
      .select()
      .from(schema.attendances)
      .where(and(eq(schema.attendances.userId, me.id), gte(schema.attendances.occurrenceDate, today))),
  ]);
  const followed = followRows
    .map((r) => r.trainerUserId)
    .filter((id) => id !== me.id && !hidden.has(id));
  const followedSet = new Set(followed);

  // ---- Upcoming: the classes you marked Going, next seven days. ----
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + UPCOMING_DAYS - 1);
  const endIso = end.toISOString().slice(0, 10);
  const marks = myMarks.filter((m) => m.occurrenceDate <= endIso);
  const markClassIds = [...new Set(marks.map((m) => m.classId))];
  const markClasses = markClassIds.length
    ? await db.select().from(schema.classes).where(inArray(schema.classes.id, markClassIds))
    : [];
  const classById = new Map(markClasses.map((c) => [c.id, c]));
  const ownerIds = [...new Set(markClasses.map((c) => c.userId))];
  const owners = ownerIds.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, ownerIds))
    : [];
  const ownerById = new Map(owners.map((o) => [o.id, o]));

  // Who you follow that is going to the same occurrences, public marks only.
  // This line is why a mark is public by default: it is the "come with me"
  // half of the product, and it only ever names people you already follow.
  const alsoRows =
    markClassIds.length && followed.length
      ? await db
          .select()
          .from(schema.attendances)
          .where(
            and(
              inArray(schema.attendances.classId, markClassIds),
              inArray(schema.attendances.userId, followed),
              eq(schema.attendances.isPublic, true),
              gte(schema.attendances.occurrenceDate, today),
            ),
          )
      : [];
  const alsoUserIds = [...new Set(alsoRows.map((r) => r.userId))];
  const alsoUsers = alsoUserIds.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, alsoUserIds))
    : [];
  const alsoNameById = new Map(alsoUsers.map((u) => [u.id, u.name.split(" ")[0] || u.name]));

  // The studios and the whole public class list load once and serve three
  // sections: upcoming cards name their studio, a coach row counts their
  // week, a studio row counts its own.
  const [studioRows, publicClasses, coachLinks, managerRows] = await Promise.all([
    db.select().from(schema.studios),
    db.select().from(schema.classes).where(eq(schema.classes.isPublic, true)),
    db.select().from(schema.coachStudios),
    db.select().from(schema.studioManagers),
  ]);
  const studioById = new Map(studioRows.map((s) => [s.id, s]));

  const upcoming: HomeUpcoming[] = marks
    .flatMap((m) => {
      const c = classById.get(m.classId);
      if (!c || !c.isPublic) return [];
      const dow = (new Date(`${m.occurrenceDate}T00:00:00Z`).getUTCDay() + 6) % 7;
      if (!runsOn(c, m.occurrenceDate, dow)) return [];
      if (occurrenceEnded(m.occurrenceDate, c.startTime, c.durationMin)) return [];
      const owner = ownerById.get(c.userId);
      const studio = c.studioId ? studioById.get(c.studioId) : undefined;
      // A gym's class has no handle behind it; the studio's page is its
      // address. Same rule as everywhere: the base, not the handle.
      const base =
        owner?.kind === "gym"
          ? studio?.slug
            ? `s/${studio.slug}`
            : null
          : (owner?.handle ?? null);
      if (!base) return [];
      const t = clockParts(c.startTime);
      const days = Math.round(
        (new Date(`${m.occurrenceDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
          86400000,
      );
      const dayLabel =
        days === 0
          ? "Today"
          : days === 1
            ? "Tomorrow"
            : new Date(`${m.occurrenceDate}T00:00:00Z`).toLocaleDateString("en-US", {
                weekday: "short",
                timeZone: "UTC",
              });
      return [
        {
          classId: c.id,
          base,
          iso: m.occurrenceDate,
          dayLabel,
          time: `${t.hm} ${t.ap}`,
          name: c.name,
          coachName: owner?.kind === "gym" ? null : (owner?.name ?? null),
          coachPhoto: owner?.kind === "gym" ? null : (owner?.photo ?? null),
          coachColor: owner ? avatarColor(owner) : avatarColor({ id: c.userId }),
          where: studio ? studio.name : c.location,
          durationMin: c.durationMin,
          href: `/${base}/${c.id}?d=${m.occurrenceDate}&from=home`,
          alsoGoing: alsoRows
            .filter((r) => r.classId === c.id && r.occurrenceDate === m.occurrenceDate)
            .map((r) => alsoNameById.get(r.userId))
            .filter((n): n is string => !!n),
        },
      ];
    })
    .sort((a, b) => a.iso.localeCompare(b.iso) || a.time.localeCompare(b.time));

  // ---- People near you: the follow graph's front door. ----
  // One load of everyone serves the people rail and the gym-kind lookups: a
  // gym account has no handle, so it can't come out of a handle-filtered
  // query, and the studio counts below need to know which owners are gyms.
  const allUsers = await db.select().from(schema.users);
  const kindById = new Map(allUsers.map((u) => [u.id, u.kind]));
  const candidates = allUsers.filter((u) => !!u.handle && u.discoverable);
  const myCity = me.location?.trim() || null;
  // Classes this week, the same signal Discover shows, over everyone at
  // once. publicSchedules folds in the shifts each coach chose to show.
  const schedRows = (await publicSchedules(candidates)).filter((c) => c.isPublic);
  const weekCount = new Map<string, number>();
  const studioWeekCount = new Map<string, number>();
  const start = new Date(`${today}T00:00:00Z`);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dow = (d.getUTCDay() + 6) % 7;
    for (const c of schedRows) {
      if (!runsOn(c, iso, dow)) continue;
      weekCount.set(c.ownerUserId, (weekCount.get(c.ownerUserId) ?? 0) + 1);
      // A shift is the gym's class shown under a coach; the gym-owned loop
      // below already counts it for the studio, so it only counts here for
      // the person.
      if (c.studioId && !c.shift)
        studioWeekCount.set(c.studioId, (studioWeekCount.get(c.studioId) ?? 0) + 1);
    }
    // A gym's own rota counts for its studio too; publicSchedules only
    // carries people, so the gym-owned rows are counted from the raw list.
    for (const c of publicClasses) {
      if (kindById.get(c.userId) !== "gym") continue;
      if (c.studioId && runsOn(c, iso, dow))
        studioWeekCount.set(c.studioId, (studioWeekCount.get(c.studioId) ?? 0) + 1);
    }
  }

  const people: HomePerson[] = candidates
    .filter((r) => r.id !== me.id && !hidden.has(r.id) && !followedSet.has(r.id))
    .filter((r) =>
      r.kind === "fan"
        ? !!r.name.trim()
        : !!r.name.trim() && !!(weekCount.get(r.id) || r.title?.trim() || r.about?.trim()),
    )
    .filter((r) => r.kind !== "gym")
    .sort((a, b) => {
      // Your city first, then whoever joined most recently: nothing here is
      // ranked, it is sorted by two facts anyone could check.
      const aLoc = a.location?.trim() === myCity && !!myCity ? 0 : 1;
      const bLoc = b.location?.trim() === myCity && !!myCity ? 0 : 1;
      return aLoc - bLoc || (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
    })
    .slice(0, PEOPLE_CAP)
    .map((r) => ({
      id: r.id,
      handle: r.handle!,
      name: r.name,
      photo: r.photo,
      color: avatarColor(r),
      kind: r.kind === "fan" ? "member" : "coach",
      sub:
        r.kind === "fan"
          ? r.location?.trim() || "Member"
          : `Coach${weekCount.get(r.id) ? ` · ${weekCount.get(r.id)} classes` : ""}`,
    }));

  // ---- Studios: three rows and the door to the rest. ----
  const coachCountByStudio = new Map<string, number>();
  for (const l of coachLinks)
    coachCountByStudio.set(l.studioId, (coachCountByStudio.get(l.studioId) ?? 0) + 1);
  const verifiedStudios = new Set(managerRows.map((m) => m.studioId));
  const studios: HomeStudio[] = studioRows
    .map((s) => {
      const verified = verifiedStudios.has(s.id);
      const coachN = coachCountByStudio.get(s.id) ?? 0;
      const weekN = studioWeekCount.get(s.id) ?? 0;
      // A verified page reads as a run place: who teaches and how much. A
      // community page says what it is: a shared entry the coaches keep.
      const sub = verified
        ? [coachN ? `${coachN} ${coachN === 1 ? "coach" : "coaches"}` : "", weekN ? `${weekN} classes/wk` : ""]
            .filter(Boolean)
            .join(" · ") || s.address
        : coachN
          ? `${s.address} · added by ${coachN} ${coachN === 1 ? "coach" : "coaches"}`
          : s.address;
      return {
        id: s.id,
        slug: s.slug ?? s.id,
        name: s.name,
        photo: s.photo,
        color: avatarColor({ id: s.id }),
        verified,
        sub,
        weekN,
      };
    })
    .sort((a, b) => Number(b.verified) - Number(a.verified) || b.weekN - a.weekN || a.name.localeCompare(b.name))
    .slice(0, STUDIO_CAP)
    .map(({ weekN: _weekN, ...s }) => s);

  // ---- Activity: what the people you follow did lately. Home shows the
  // first few; /activity is the same feed uncapped. ----
  const activity = await activityFeed(me);

  return {
    location: myCity,
    todayLabel: fmtDayHeader(today),
    upcoming,
    people,
    studios,
    activity,
  };
}

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

/**
 * What the people you follow did lately.
 *
 * Home shows the first few of these and `/activity` shows the lot, which is
 * why it lives here rather than inside `homeData`: two builders for one feed
 * would drift, and this one carries the rules that matter. Only public acts
 * reach it (a Going mark is public by default, a Personal row has no column
 * that could make it public), it is grouped by seriesId so a weekly class
 * counts once, and coach posts lead because a coach putting next week up is
 * the one thing here that regenerates without the follow graph growing.
 */
export async function activityFeed(me: UserRow, cap = ACTIVITY_CAP): Promise<HomeActivity[]> {
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

  type Cand = HomeActivity & { at: number };
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
