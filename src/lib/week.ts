import { and, asc, eq, gte, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { clockParts, fmtDayHeader, occurrenceEnded, todayIso } from "@/lib/format";

// The classes someone has added, from today forward.
//
// Deliberately not a calendar. It's the shortlist: only what they picked, in
// time order, and it empties itself as the week passes. The count in the header
// counts what's still ahead, because a number that only ever grows is a
// scoreboard rather than something you can act on.

export type WeekItem = {
  id: string;
  classId: string;
  iso: string;
  dayLabel: string;
  name: string;
  hm: string;
  ap: string;
  durationMin: number;
  where: string | null;
  /** The class photo and type, for the card the lists draw. */
  image?: string | null;
  classType?: string | null;
  handle: string;
  coachName: string;
  coachPhoto: string | null;
  coachColor: string;
  /** A personal entry: theirs alone, with no class page behind it. The id is
   *  the personal_classes row, and removing it is removePersonalClass. */
  personal?: boolean;
  /** Mutual follows who added this same occurrence. Empty for everyone else:
   *  one-way follows see nothing, which is what makes following safe. */
  alsoGoing?: { name: string; photo: string | null; color: string; handle: string | null }[];
};

export type WeekDay = { iso: string; label: string; items: WeekItem[] };

/** The next date on or after today falling on this weekday (0 = Monday). */
function nextOccurrence(dayOfWeek: number): string {
  const d = new Date(`${todayIso()}T00:00:00Z`);
  const today = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() + ((dayOfWeek - today + 7) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * The next date one of your own entries runs that hasn't been and gone, or
 * null once it has stopped: a one-off whose date has passed, or a weekly one
 * past its end date. One function so the list, the count and the share image
 * can't disagree about whether something is still ahead.
 */
export function personalNext(p: {
  dayOfWeek: number;
  startTime: string;
  durationMin: number;
  specificDate?: string | null;
  endsOn?: string | null;
}): string | null {
  if (p.specificDate)
    return occurrenceEnded(p.specificDate, p.startTime, p.durationMin) ? null : p.specificDate;
  let iso = nextOccurrence(p.dayOfWeek);
  if (occurrenceEnded(iso, p.startTime, p.durationMin)) {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7);
    iso = d.toISOString().slice(0, 10);
  }
  return p.endsOn && iso > p.endsOn ? null : iso;
}

/** How many added classes are still ahead of them, personal entries included. */
export async function weekCount(userId: string): Promise<number> {
  const db = await getDb();
  const [rows, own] = await Promise.all([
    db
      .select({ id: schema.attendances.id })
      .from(schema.attendances)
      .where(
        and(
          eq(schema.attendances.userId, userId),
          gte(schema.attendances.occurrenceDate, todayIso()),
        ),
      ),
    db.select().from(schema.personalClasses).where(eq(schema.personalClasses.userId, userId)),
  ]);
  // A weekly entry counts once, for its next occurrence; a one-off counts
  // until its date has been and gone. Either way it drops out of the number
  // once it has run, same as everything else.
  const ownAhead = own.filter((p) => personalNext(p) !== null).length;
  return rows.length + ownAhead;
}

/** Do these two people follow each other? Both directions, neither opted out.
 *  Account follows always carry the follower's email, so the pair of email
 *  matches is the whole check. */
export async function mutualFollow(aId: string, bId: string): Promise<boolean> {
  if (aId === bId) return false;
  const db = await getDb();
  const people = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(inArray(schema.users.id, [aId, bId]));
  const a = people.find((p) => p.id === aId);
  const b = people.find((p) => p.id === bId);
  if (!a || !b) return false;
  const [aFollowsB, bFollowsA] = await Promise.all([
    db
      .select({ id: schema.subscribers.id })
      .from(schema.subscribers)
      .where(
        and(
          eq(schema.subscribers.trainerUserId, bId),
          eq(schema.subscribers.email, a.email),
          isNull(schema.subscribers.optedOutAt),
        ),
      ),
    db
      .select({ id: schema.subscribers.id })
      .from(schema.subscribers)
      .where(
        and(
          eq(schema.subscribers.trainerUserId, aId),
          eq(schema.subscribers.email, b.email),
          isNull(schema.subscribers.optedOutAt),
        ),
      ),
  ]);
  return aFollowsB.length > 0 && bFollowsA.length > 0;
}

export type SharedWeekItem = {
  classId: string;
  iso: string;
  name: string;
  hm: string;
  ap: string;
  durationMin: number;
  where: string | null;
  handle: string;
  coachName: string;
};

/** The week someone shows the people they follow back: only real, public
 *  classes they added, from today forward. Personal entries never appear
 *  here; there is deliberately no way to share those. */
export async function sharedWeek(
  userId: string,
): Promise<{ iso: string; label: string; items: SharedWeekItem[] }[]> {
  const db = await getDb();
  const marks = await db
    .select()
    .from(schema.attendances)
    .where(
      and(
        eq(schema.attendances.userId, userId),
        gte(schema.attendances.occurrenceDate, todayIso()),
      ),
    )
    .orderBy(asc(schema.attendances.occurrenceDate));
  if (marks.length === 0) return [];

  const classIds = [...new Set(marks.map((m) => m.classId))];
  const classRows = (
    await db.select().from(schema.classes).where(inArray(schema.classes.id, classIds))
  ).filter((c) => c.isPublic);
  const classById = new Map(classRows.map((c) => [c.id, c]));
  const coachIds = [...new Set(classRows.map((c) => c.userId))];
  const coaches = coachIds.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, coachIds))
    : [];
  const coachById = new Map(coaches.map((u) => [u.id, u]));
  const studioIds = [...new Set(classRows.map((c) => c.studioId).filter((s): s is string => !!s))];
  const studios = studioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds))
    : [];
  const studioById = new Map(studios.map((s) => [s.id, s]));

  const byDay = new Map<string, SharedWeekItem[]>();
  for (const m of marks) {
    const c = classById.get(m.classId);
    if (!c) continue;
    const coach = coachById.get(c.userId);
    // The base its class page lives under. A coach's is their handle; a gym's
    // account has none by design, so its classes are addressed under the
    // studio. Testing the handle alone dropped every gym class out of the week
    // silently, which is the same handle-as-proxy mistake as ever.
    const st = c.studioId ? studioById.get(c.studioId) : null;
    const base = coach?.handle ?? (st?.slug ? `s/${st.slug}` : null);
    if (!coach || !base) continue;
    const t = clockParts(c.startTime);
    const list = byDay.get(m.occurrenceDate) ?? [];
    list.push({
      classId: c.id,
      iso: m.occurrenceDate,
      name: c.name,
      hm: t.hm,
      ap: t.ap,
      durationMin: c.durationMin,
      where: c.studioId ? (studioById.get(c.studioId)?.name ?? null) : c.location,
      handle: base,
      coachName: coach.name,
    });
    byDay.set(m.occurrenceDate, list);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, items]) => ({
      iso,
      label: fmtDayHeader(iso),
      items: items.sort((a, b) => a.hm.localeCompare(b.hm)),
    }));
}

/** The shortlist itself, grouped by day. */
export async function myWeek(userId: string): Promise<WeekDay[]> {
  const db = await getDb();
  const marks = await db
    .select()
    .from(schema.attendances)
    .where(
      and(
        eq(schema.attendances.userId, userId),
        gte(schema.attendances.occurrenceDate, todayIso()),
      ),
    )
    .orderBy(asc(schema.attendances.occurrenceDate));
  const own = await db
    .select()
    .from(schema.personalClasses)
    .where(eq(schema.personalClasses.userId, userId));
  if (marks.length === 0 && own.length === 0) return [];

  const classIds = [...new Set(marks.map((m) => m.classId))];
  const classRows = await db
    .select()
    .from(schema.classes)
    .where(inArray(schema.classes.id, classIds));
  const classById = new Map(classRows.map((c) => [c.id, c]));

  const coachIds = [...new Set(classRows.map((c) => c.userId))];
  const coaches = coachIds.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, coachIds))
    : [];
  const coachById = new Map(coaches.map((u) => [u.id, u]));

  // Both halves' studios in one query: a class's, and the places on your own
  // entries, which have a real studio now rather than a line of free text.
  const studioIds = [
    ...new Set(
      [...classRows.map((c) => c.studioId), ...own.map((p) => p.studioId)].filter(
        (s): s is string => !!s,
      ),
    ),
  ];
  const studios = studioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds))
    : [];
  const studioById = new Map(studios.map((s) => [s.id, s]));
  const ownStudioById = studioById;

  // Who you know that's going: mutuals only. A follows B and B follows A, and
  // both added the same occurrence. One-way follows surface nothing, so
  // following someone never shows them your week; agreeing to each other does.
  const alsoByKey = new Map<string, { name: string; photo: string | null; color: string; handle: string | null }[]>();
  if (marks.length) {
    const [me] = await db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    if (me) {
      const [iFollowRows, followMeRows] = await Promise.all([
        db
          .select({ trainerUserId: schema.subscribers.trainerUserId })
          .from(schema.subscribers)
          .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt))),
        db
          .select({ userId: schema.subscribers.userId, email: schema.subscribers.email })
          .from(schema.subscribers)
          .where(and(eq(schema.subscribers.trainerUserId, userId), isNull(schema.subscribers.optedOutAt))),
      ]);
      const iFollow = new Set(iFollowRows.map((r) => r.trainerUserId));
      // A follower row keyed only on email (they followed before signing in)
      // still counts once the address has an account.
      const followerEmails = followMeRows.filter((r) => !r.userId).map((r) => r.email);
      const emailAccounts = followerEmails.length
        ? await db
            .select({ id: schema.users.id, email: schema.users.email })
            .from(schema.users)
            .where(inArray(schema.users.email, followerEmails))
        : [];
      const followMe = new Set([
        ...followMeRows.map((r) => r.userId).filter((id): id is string => !!id),
        ...emailAccounts.map((u) => u.id),
      ]);
      // Never yourself: one self-subscribe row (email-subscribing to your own
      // page) satisfies both directions at once, and then your own week said
      // you were going to your own classes, too.
      const mutuals = [...iFollow].filter((id) => id !== userId && followMe.has(id));
      if (mutuals.length) {
        const theirMarks = await db
          .select()
          .from(schema.attendances)
          .where(
            and(
              inArray(schema.attendances.userId, mutuals),
              gte(schema.attendances.occurrenceDate, todayIso()),
            ),
          );
        const myKeys = new Set(marks.map((m) => `${m.classId}|${m.occurrenceDate}`));
        const overlapping = theirMarks.filter((t) =>
          myKeys.has(`${t.classId}|${t.occurrenceDate}`),
        );
        if (overlapping.length) {
          const peopleIds = [...new Set(overlapping.map((t) => t.userId))];
          const people = await db
            .select()
            .from(schema.users)
            .where(inArray(schema.users.id, peopleIds));
          const personById = new Map(people.map((p) => [p.id, p]));
          for (const t of overlapping) {
            const p = personById.get(t.userId);
            if (!p) continue;
            const key = `${t.classId}|${t.occurrenceDate}`;
            const list = alsoByKey.get(key) ?? [];
            list.push({
              name: p.name.trim() || p.email.split("@")[0],
              photo: p.photo,
              color: avatarColor(p),
              handle: p.handle,
            });
            alsoByKey.set(key, list);
          }
        }
      }
    }
  }

  const byDay = new Map<string, WeekItem[]>();
  for (const m of marks) {
    const c = classById.get(m.classId);
    // A class deleted out from under a mark leaves the mark behind for a
    // moment. Skip it rather than rendering a row with nothing in it.
    if (!c) continue;
    const coach = coachById.get(c.userId);
    // The base its class page lives under. A coach's is their handle; a gym's
    // account has none by design, so its classes are addressed under the
    // studio. Testing the handle alone dropped every gym class out of the week
    // silently, which is the same handle-as-proxy mistake as ever.
    const st = c.studioId ? studioById.get(c.studioId) : null;
    const base = coach?.handle ?? (st?.slug ? `s/${st.slug}` : null);
    if (!coach || !base) continue;
    const t = clockParts(c.startTime);
    const list = byDay.get(m.occurrenceDate) ?? [];
    list.push({
      id: m.id,
      classId: c.id,
      iso: m.occurrenceDate,
      dayLabel: fmtDayHeader(m.occurrenceDate),
      name: c.name,
      hm: t.hm,
      ap: t.ap,
      durationMin: c.durationMin,
      where: c.studioId ? (studioById.get(c.studioId)?.name ?? null) : c.location,
      image: c.image,
      classType: c.classType,
      handle: base,
      coachName: coach.name,
      coachPhoto: coach.photo,
      coachColor: avatarColor(coach),
      alsoGoing: alsoByKey.get(`${m.classId}|${m.occurrenceDate}`),
    });
    byDay.set(m.occurrenceDate, list);
  }

  // Personal entries land on their next occurrence that hasn't already run,
  // so a weekly one reappears each week and the list still empties itself. A
  // one-off whose date has passed, or a weekly one past its end, is gone.
  for (const p of own) {
    const iso = personalNext(p);
    if (!iso) continue;
    const t = clockParts(p.startTime);
    const list = byDay.get(iso) ?? [];
    list.push({
      id: p.id,
      classId: "",
      iso,
      dayLabel: fmtDayHeader(iso),
      name: p.name,
      hm: t.hm,
      ap: t.ap,
      durationMin: p.durationMin,
      where: (p.studioId ? ownStudioById.get(p.studioId)?.name : null) || p.location || null,
      image: p.image,
      classType: p.classType,
      handle: "",
      coachName: p.withWho,
      coachPhoto: null,
      // Deep enough for white words: the card draws the class in this colour
      // when there is no photo, and sand under white text was unreadable.
      coachColor: "#77705a",
      personal: true,
    });
    byDay.set(iso, list);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, items]) => ({
      iso,
      label: fmtDayHeader(iso),
      items: items.sort((a, b) => a.hm.localeCompare(b.hm)),
    }));
}
