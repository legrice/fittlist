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

/**
 * May this viewer see that person's week?
 *
 * The Instagram rule, and it is the whole rule: an account is open unless its
 * owner has turned approve-first on, and then it is followers only. It used to
 * take a mutual follow, which meant somebody had to follow you back before you
 * could see when they train, and that is a handshake nobody asked for on a
 * schedule. This is a scheduling app: knowing who is going where and when is
 * the point, so the default is that you can see it.
 *
 * `users.approveFollowers` is the one switch, already in settings and already
 * what turns Follow into an ask. Nothing new to set, and the two halves of
 * "private account" now agree: gating who may follow gates what they see.
 *
 * A signed-out viewer counts as following nobody, so an approve-first person's
 * week is invisible to them, which is right: they cannot have been approved.
 */
export async function canSeeWeek(
  viewerId: string | null,
  owner: { id: string; approveFollowers: boolean },
): Promise<boolean> {
  if (viewerId === owner.id) return true;
  if (!owner.approveFollowers) return true;
  if (!viewerId) return false;
  const db = await getDb();
  const [viewer] = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, viewerId));
  if (!viewer) return false;
  // Approved follows are the only rows in `subscribers`: an ask that has not
  // been answered lives in `follow_requests` and is not one of these.
  const rows = await db
    .select({ id: schema.subscribers.id })
    .from(schema.subscribers)
    .where(
      and(
        eq(schema.subscribers.trainerUserId, owner.id),
        eq(schema.subscribers.email, viewer.email),
        isNull(schema.subscribers.optedOutAt),
      ),
    );
  return rows.length > 0;
}

export type SharedWeekItem = {
  classId: string;
  iso: string;
  name: string;
  hm: string;
  ap: string;
  durationMin: number;
  where: string | null;
  /** The base its class page lives under, or null for one of their own: a
   *  personal entry has no page, so its row is plain text. */
  handle: string | null;
  /** Whose class it is, or null for one of their own. */
  coachName: string | null;
};

/**
 * The week someone shows the people they follow back, from today forward.
 *
 * Both halves of it now: the marks they made at a coach's real class, and the
 * entries they keep themselves. Personal entries used to be excluded outright,
 * on the grounds that there was deliberately no way to share them, and by
 * Matt's call that is no longer the rule: a week made mostly of your own
 * entries showed a mutual follow an empty page, which is the whole thing this
 * list exists to avoid.
 *
 * The audience is unchanged and is what makes it safe: only somebody you
 * follow who follows you back, never a stranger with the link, and never a
 * one-way follower. That mutual tap is the consent, and it is why a row here
 * can name a place and a time that a public page never could.
 */
export async function sharedWeek(
  userId: string,
): Promise<{ iso: string; label: string; items: SharedWeekItem[] }[]> {
  const db = await getDb();
  const [marks, own] = await Promise.all([
    db
      .select()
      .from(schema.attendances)
      .where(
        and(
          eq(schema.attendances.userId, userId),
          gte(schema.attendances.occurrenceDate, todayIso()),
        ),
      )
      .orderBy(asc(schema.attendances.occurrenceDate)),
    db.select().from(schema.personalClasses).where(eq(schema.personalClasses.userId, userId)),
  ]);
  if (marks.length === 0 && own.length === 0) return [];

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

  // Their own entries, expanded the same way the calendar expands them, out to
  // a fortnight rather than the calendar's nine weeks: this is somebody
  // else's page, and two weeks answers "what are they up to" without handing
  // over two months of a person's movements.
  const SHARED_WEEKS = 2;
  const ownStudioIds = [...new Set(own.map((p) => p.studioId).filter((x): x is string => !!x))];
  const ownStudios = ownStudioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, ownStudioIds))
    : [];
  const ownStudioById = new Map(ownStudios.map((s) => [s.id, s]));
  for (const p of own) {
    const first = personalNext(p);
    if (!first) continue;
    const dates: string[] = [];
    if (p.specificDate) dates.push(first);
    else {
      let iso = first;
      for (let k = 0; k < SHARED_WEEKS; k++) {
        if (p.endsOn && iso > p.endsOn) break;
        dates.push(iso);
        const d = new Date(`${iso}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 7);
        iso = d.toISOString().slice(0, 10);
      }
    }
    const t = clockParts(p.startTime);
    for (const iso of dates) {
      const list = byDay.get(iso) ?? [];
      list.push({
        classId: p.id,
        iso,
        name: p.name,
        hm: t.hm,
        ap: t.ap,
        durationMin: p.durationMin,
        where: p.studioId ? (ownStudioById.get(p.studioId)?.name ?? null) : p.location,
        // No page and nobody else's name: one of their own is a plain row.
        handle: null,
        coachName: null,
      });
      byDay.set(iso, list);
    }
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, items]) => ({
      iso,
      label: fmtDayHeader(iso),
      items: items.sort((a, b) => a.hm.localeCompare(b.hm)),
    }));
}

/** The shortlist itself, grouped by day. With `pastDays` the same list also
 *  reaches back: the calendars let you scroll into what has been, so the
 *  marks and entries inside that window come along. Every other caller gets
 *  today forward, exactly as before. */
export async function myWeek(
  userId: string,
  opts?: { pastDays?: number },
): Promise<WeekDay[]> {
  const db = await getDb();
  const pastDays = opts?.pastDays ?? 0;
  const sinceIso = (() => {
    const d = new Date(`${todayIso()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - pastDays);
    return d.toISOString().slice(0, 10);
  })();
  const marks = await db
    .select()
    .from(schema.attendances)
    .where(
      and(
        eq(schema.attendances.userId, userId),
        gte(schema.attendances.occurrenceDate, sinceIso),
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
      handle: base,
      coachName: coach.name,
      coachPhoto: coach.photo,
      coachColor: avatarColor(coach),
      alsoGoing: alsoByKey.get(`${m.classId}|${m.occurrenceDate}`),
    });
    byDay.set(m.occurrenceDate, list);
  }

  // Personal entries land on every occurrence still ahead, out to the same
  // horizon the calendars draw: this list is a calendar now, and a weekly
  // entry that only showed its next date read as a class that stopped. A
  // one-off whose date has passed, or a weekly one past its end, is gone.
  const HORIZON_WEEKS = 9;
  const today = todayIso();
  for (const p of own) {
    const first = personalNext(p);
    const dates: string[] = [];
    if (p.specificDate) {
      // Still ahead as ever; been-and-gone only inside the past window.
      if (first) dates.push(first);
      else if (pastDays > 0 && p.specificDate >= sinceIso && p.specificDate < today)
        dates.push(p.specificDate);
    } else {
      if (first) {
        let iso = first;
        for (let k = 0; k < HORIZON_WEEKS; k++) {
          if (p.endsOn && iso > p.endsOn) break;
          dates.push(iso);
          const d = new Date(`${iso}T00:00:00Z`);
          d.setUTCDate(d.getUTCDate() + 7);
          iso = d.toISOString().slice(0, 10);
        }
      }
      // The past window walks the weekday back from the last date it could
      // have run: yesterday, or the entry's end if that came first. Only
      // dates before `first` so the two halves can't double a day.
      if (pastDays > 0) {
        const upper = p.endsOn && p.endsOn < today ? p.endsOn : today;
        const d = new Date(`${upper}T00:00:00Z`);
        const dow = (d.getUTCDay() + 6) % 7;
        d.setUTCDate(d.getUTCDate() - ((dow - p.dayOfWeek + 7) % 7));
        let iso = d.toISOString().slice(0, 10);
        while (iso >= sinceIso) {
          if ((!first || iso < first) && iso < today && !dates.includes(iso)) dates.push(iso);
          d.setUTCDate(d.getUTCDate() - 7);
          iso = d.toISOString().slice(0, 10);
        }
      }
    }
    if (!dates.length) continue;
    const t = clockParts(p.startTime);
    for (const iso of dates) {
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
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, items]) => ({
      iso,
      label: fmtDayHeader(iso),
      items: items.sort((a, b) => a.hm.localeCompare(b.hm)),
    }));
}
