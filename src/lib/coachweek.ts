import { and, inArray, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { dowOfDate } from "@/lib/format";

// What a coach's schedule is, once the gyms they work for are in the picture.
//
// A coach's own classes are rows they own (`classes.userId`). A shift at a gym
// is a row the *gym* owns with the coach on it (`classes.coachUserId`), and by
// default it stays private: it reaches their calendar and nowhere else, so a
// coach who wants no public presence still knows they're on.
//
// `users.shiftsPublic` is the coach's own answer to the other question: do the
// classes I actually teach belong on my page. It is theirs to make and nobody
// else's, and it is a different question from whether the *gym's* schedule
// names them, which is the gym's and stays off. The more private of the two
// still wins on the gym's own page.
//
// Everything that shows a coach's public week asks this, for the same reason
// everything expanding a recurrence asks runsOn: one answer, or the page, the
// feed, the digest, the share image and the .ics quietly disagree.

export type ScheduleRow = typeof schema.classes.$inferSelect & {
  /** Whose schedule this row belongs on. Not `userId`: a shift is owned by the
   *  gym and shown under the coach, so callers naming a coach want this. */
  ownerUserId: string;
  /** A gym's class this coach is on, rather than one of their own. Its page
   *  lives under the studio, because that is who the class belongs to. */
  shift: boolean;
};

type Who = { id: string; shiftsPublic: boolean };

const own = (r: typeof schema.classes.$inferSelect): ScheduleRow => ({
  ...r,
  ownerUserId: r.userId,
  shift: false,
});

/**
 * The public schedule rows for one or more coaches, shifts folded in.
 *
 * Covers are folded into the rows themselves rather than handed back beside
 * them: a date somebody else took becomes a skipDate, and a date handed to
 * this coach becomes a one-off pinned to it. That way `runsOn` keeps being the
 * only thing a caller needs, and no surface has to learn what a swap is.
 */
export async function publicSchedules(who: Who[]): Promise<ScheduleRow[]> {
  const ids = [...new Set(who.map((w) => w.id))];
  if (!ids.length) return [];
  return build(
    ids,
    who.filter((w) => w.shiftsPublic).map((w) => w.id),
  );
}

/**
 * A coach's own schedule, shifts always included.
 *
 * `shiftsPublic` answers "does anyone else see these", which is a question
 * about strangers. On their own screen it never applies: a coach who is on
 * Thursday at seven has to be able to see that they are on Thursday at seven,
 * and not knowing you were on is the thing the spreadsheet cost somebody.
 */
export async function mySchedule(userId: string): Promise<ScheduleRow[]> {
  return build([userId], [userId]);
}

async function build(ids: string[], sharing: string[]): Promise<ScheduleRow[]> {
  const db = await getDb();
  const rows = await db.select().from(schema.classes).where(inArray(schema.classes.userId, ids));
  const out = rows.map(own);
  if (!sharing.length) return out;

  // Slots these coaches are on at a gym. Their own rows are already in hand,
  // and a coach can't be on their own class in the rota sense.
  const shifts = await db
    .select()
    .from(schema.classes)
    .where(
      and(
        inArray(schema.classes.coachUserId, sharing),
        ne(schema.classes.userId, schema.classes.coachUserId),
      ),
    );
  const mine = new Set(rows.map((r) => r.id));
  const standing = shifts.filter((s) => !mine.has(s.id));

  // The exceptions. A cover wins over the class for its one date, so a date
  // somebody else took has to come off this coach's week, and a date they were
  // handed has to come onto it, even on a slot they don't normally teach.
  const covers = standing.length
    ? await db.select().from(schema.shiftCovers)
    : [];
  const sharingSet = new Set(sharing);
  const takenAway = new Map<string, string[]>();
  const handedOver: typeof covers = [];
  const standingById = new Map(standing.map((s) => [s.id, s]));
  for (const cv of covers) {
    if (cv.coachUserId && sharingSet.has(cv.coachUserId)) {
      handedOver.push(cv);
      continue;
    }
    const s = standingById.get(cv.classId);
    if (!s) continue;
    const list = takenAway.get(cv.classId) ?? [];
    list.push(cv.occurrenceDate);
    takenAway.set(cv.classId, list);
  }

  for (const s of standing) {
    const off = takenAway.get(s.id) ?? [];
    out.push({
      ...s,
      skipDates: off.length ? [...new Set([...s.skipDates, ...off])].sort() : s.skipDates,
      ownerUserId: s.coachUserId!,
      shift: true,
    });
  }

  // A date handed to a coach on a slot somebody else normally teaches has no
  // standing row to hang off, so it becomes the one-off it actually is.
  const extraIds = [...new Set(handedOver.map((c) => c.classId))].filter(
    (id) => !standingById.has(id) && !mine.has(id),
  );
  const extras = extraIds.length
    ? await db.select().from(schema.classes).where(inArray(schema.classes.id, extraIds))
    : [];
  const extraById = new Map(extras.map((e) => [e.id, e]));
  for (const cv of handedOver) {
    const cls = extraById.get(cv.classId);
    if (!cls || !cv.coachUserId) continue;
    out.push({
      ...cls,
      dayOfWeek: dowOfDate(cv.occurrenceDate),
      specificDate: cv.occurrenceDate,
      endsOn: null,
      skipDates: [],
      ownerUserId: cv.coachUserId,
      shift: true,
    });
  }

  return out;
}

/** The same, for one coach. */
export async function publicSchedule(w: Who): Promise<ScheduleRow[]> {
  return publicSchedules([w]);
}

/** Everyone whose schedule is being asked for, with their answer to the
 *  question. Callers usually have the user rows already; this is for the ones
 *  that only have ids. */
export async function whoFor(ids: string[]): Promise<Who[]> {
  if (!ids.length) return [];
  const db = await getDb();
  const rows = await db
    .select({ id: schema.users.id, shiftsPublic: schema.users.shiftsPublic })
    .from(schema.users)
    .where(inArray(schema.users.id, ids));
  return rows;
}

/**
 * Where a row's class page lives: a coach's under their handle, a gym's under
 * the studio it runs at, because that is who owns it.
 *
 * Two values, because they are two different things and conflating them is how
 * a link 404s. `base` is the URL segment (`s/ironbound`), `key` is what
 * `classDetail` looks the owner up by (`ironbound`, a handle or a slug).
 */
export function classAddress(
  row: ScheduleRow,
  handle: string | null,
  studioSlug: string | null | undefined,
): { key: string; base: string } | null {
  if (row.shift) return studioSlug ? { key: studioSlug, base: `s/${studioSlug}` } : null;
  return handle ? { key: handle, base: handle } : null;
}
