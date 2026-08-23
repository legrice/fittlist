"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { isBlocked } from "@/lib/blocks";
import { publicSchedules, shiftNaming } from "@/lib/coachweek";
import { clockParts, fmtDayHeaderRel, occurrenceEnded, runsOn, todayIso } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { canSeeWeek } from "@/lib/week";

/** A class in a person's peek: theirs to lead, or one they saved, and
 *  whether it is already on your own week. */
export type PeekItem = {
  classId: string;
  iso: string;
  name: string;
  hm: string;
  ap: string;
  durationMin: number;
  where: string | null;
  /** The base its class page lives under: a handle, or `s/{slug}` for a gym. */
  base: string;
  /** You saved it too, which is the overlap marker: "you're going to that,
   *  I'm going to that" without anyone declaring anything beyond a save. */
  saved: boolean;
  /** They lead it. The one place in the app where coach and member differ. */
  coaching: boolean;
};

export type PeekDay = { iso: string; label: string; items: PeekItem[] };

export type Peek = {
  name: string;
  handle: string | null;
  photo: string | null;
  color: string;
  /** "Week of Aug 9": the header's second line. */
  weekOf: string;
  /** For the header's Follow / Following pill. */
  following: boolean;
  /** How many of these are on your own week already. */
  shared: number;
  /** Their saved half withheld by approve-first: the sheet says so in the
   *  same words whatever the week holds. A coach's teaching half is never
   *  gated, because their page is the product. */
  gated: boolean;
  messagesOpen: boolean;
  days: PeekDay[];
};

/** How far the peek looks. A fortnight, not the calendar's nine weeks: this is
 *  a glance at what somebody has on, and a list you scroll for two months is a
 *  page rather than a peek. */
const PEEK_DAYS = 14;

const minsOf = (it: { hm: string; ap: string }) => {
  const [h, m] = it.hm.split(":").map(Number);
  return ((h % 12) + (it.ap.toUpperCase() === "PM" ? 12 : 0)) * 60 + (m || 0);
};

/**
 * A person's week, opened from their circle: everything they coach plus
 * everything they saved, in time order, as a live calendar rather than an
 * image. Rows carry working ribbons, because saving from here is what puts
 * a class on your own week.
 *
 * The coaching half asks `publicSchedules`, the same loader the coach's own
 * page and the digests ask, so a coach's week cannot say one thing in the
 * peek and another on their page. The saved half is their public marks,
 * behind `canSeeWeek` and never around it. Personal entries never reach
 * this: there is no column that could make one public.
 *
 * Opening the peek is what puts the ring out: `subscribers.peekedAt` is
 * written here, on open, because the ring promises there is something new
 * and that is kept the moment somebody is looking.
 */
export async function personPeek(personUserId: string): Promise<Peek | null> {
  const viewerId = await getSessionUserId();
  if (!viewerId) return null;
  const db = await getDb();
  const [person] = await db.select().from(schema.users).where(eq(schema.users.id, personUserId));
  if (!person) return null;
  // Blocked in either direction: as far as they are concerned, no such week.
  if (await isBlocked(personUserId, viewerId)) return null;

  const [viewer] = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, viewerId));
  if (!viewer) return null;

  // The ring goes out now, not on close: fired there it is lost to a reload
  // or a back swipe, and a ring lit over a week already read is one nobody
  // believes twice. Also answers whether the viewer follows them.
  const subRows = await db
    .select({ id: schema.subscribers.id })
    .from(schema.subscribers)
    .where(
      and(
        eq(schema.subscribers.trainerUserId, personUserId),
        eq(schema.subscribers.email, viewer.email),
        isNull(schema.subscribers.optedOutAt),
      ),
    );
  const following = subRows.length > 0;
  if (following) {
    await db
      .update(schema.subscribers)
      .set({ peekedAt: new Date() })
      .where(eq(schema.subscribers.id, subRows[0].id));
  }

  const today = todayIso();
  const last = new Date(Date.parse(`${today}T00:00:00Z`) + (PEEK_DAYS - 1) * 864e5)
    .toISOString()
    .slice(0, 10);

  // Their coaching half: only a coach has one, and it is never gated,
  // because the public page it mirrors is the product.
  const isCoach = person.kind !== "fan" && person.kind !== "gym";
  const coachRows = isCoach
    ? (await publicSchedules([{ id: person.id, shiftsPublic: person.shiftsPublic }])).filter(
        (c) => c.isPublic,
      )
    : [];

  // Their saved half: public marks at public classes, behind the one gate
  // that already exists. Personal entries never reach this.
  const canSee = await canSeeWeek(viewerId, person);
  const gated = !canSee;
  const theirMarks = canSee
    ? (
        await db
          .select()
          .from(schema.attendances)
          .where(
            and(
              eq(schema.attendances.userId, personUserId),
              eq(schema.attendances.isPublic, true),
            ),
          )
      ).filter((m) => m.occurrenceDate >= today && m.occurrenceDate <= last)
    : [];
  const markedClasses = theirMarks.length
    ? (
        await db
          .select()
          .from(schema.classes)
          .where(inArray(schema.classes.id, [...new Set(theirMarks.map((m) => m.classId))]))
      ).filter((c) => c.isPublic)
    : [];
  const markedById = new Map(markedClasses.map((c) => [c.id, c]));
  const markedOwners = markedClasses.length
    ? await db
        .select({ id: schema.users.id, handle: schema.users.handle })
        .from(schema.users)
        .where(inArray(schema.users.id, [...new Set(markedClasses.map((c) => c.userId))]))
    : [];
  const ownerHandle = new Map(markedOwners.map((u) => [u.id, u.handle]));

  // What the viewer saved, so the overlap marker starts right.
  const mine = new Set(
    (
      await db
        .select({
          classId: schema.attendances.classId,
          occurrenceDate: schema.attendances.occurrenceDate,
        })
        .from(schema.attendances)
        .where(eq(schema.attendances.userId, viewerId))
    ).map((m) => `${m.classId}|${m.occurrenceDate}`),
  );

  const studioIds = [
    ...new Set(
      [...coachRows.map((r) => r.studioId), ...markedClasses.map((c) => c.studioId)].filter(
        (s): s is string => !!s,
      ),
    ),
  ];
  const studios = studioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds))
    : [];
  const studioById = new Map(studios.map((s) => [s.id, s]));
  await shiftNaming(coachRows.filter((r) => r.shift).map((r) => r.id));

  const days: PeekDay[] = [];
  let shared = 0;
  const day = new Date(`${today}T00:00:00Z`);
  for (let i = 0; i < PEEK_DAYS; i++) {
    const iso = day.toISOString().slice(0, 10);
    const dow = (day.getUTCDay() + 6) % 7;
    day.setUTCDate(day.getUTCDate() + 1);
    const items: PeekItem[] = [];
    const put = (it: PeekItem) => {
      if (items.some((x) => x.classId === it.classId && x.iso === it.iso)) return;
      if (it.saved) shared++;
      items.push(it);
    };
    for (const c of coachRows) {
      if (!runsOn(c, iso, dow)) continue;
      if (occurrenceEnded(iso, c.startTime, c.durationMin)) continue;
      const st = c.studioId ? studioById.get(c.studioId) : null;
      // A shift lives under the studio, because the gym owns the class.
      const base = c.shift ? (st?.slug ? `s/${st.slug}` : null) : person.handle;
      if (!base) continue;
      const t = clockParts(c.startTime);
      put({
        classId: c.id,
        iso,
        name: c.name,
        hm: t.hm,
        ap: t.ap,
        durationMin: c.durationMin,
        where: st?.name ?? c.location,
        base,
        saved: mine.has(`${c.id}|${iso}`),
        coaching: true,
      });
    }
    for (const m of theirMarks) {
      if (m.occurrenceDate !== iso) continue;
      const c = markedById.get(m.classId);
      if (!c) continue;
      if (occurrenceEnded(iso, c.startTime, c.durationMin)) continue;
      const st = c.studioId ? studioById.get(c.studioId) : null;
      // A gym's class lives under the studio, because its account has no
      // handle; anyone else's under their own.
      const base = ownerHandle.get(c.userId) || (st?.slug ? `s/${st.slug}` : null);
      if (!base) continue;
      const t = clockParts(c.startTime);
      put({
        classId: c.id,
        iso,
        name: c.name,
        hm: t.hm,
        ap: t.ap,
        durationMin: c.durationMin,
        where: st?.name ?? c.location,
        base,
        saved: mine.has(`${c.id}|${iso}`),
        coaching: false,
      });
    }
    if (items.length)
      days.push({
        iso,
        // The same words the calendar underneath uses, Today and Tomorrow
        // included: a peek that says "Wednesday" over a week that says "Today"
        // is one day named two ways on two screens a tap apart.
        label: fmtDayHeaderRel(iso),
        // The stacked clock says "PM" uppercase, so folding it back to
        // minutes compares case-insensitively; a === "pm" put every evening
        // class at dawn once already.
        items: items.sort((a, b) => minsOf(a) - minsOf(b) || a.name.localeCompare(b.name)),
      });
  }

  // The header names whoever's circle was tapped, never whoever the rota
  // has on the first row: a covered date can belong to somebody else, and
  // this sheet answers "what has Erin got on", not "who is working".
  return {
    name: person.name.trim() || person.email.split("@")[0],
    handle: person.handle,
    photo: person.photo,
    color: avatarColor(person),
    weekOf: `Week of ${new Date(`${today}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`,
    following,
    shared,
    gated,
    messagesOpen: person.messagesOpen,
    days,
  };
}
