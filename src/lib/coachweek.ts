import { and, getTableColumns, inArray, ne, type SQL } from "drizzle-orm";
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
  /** This is the coach's own older copy of a slot a gym now runs, and the id
   *  of the gym's row. Every coach at a gym listed their classes here before
   *  the gym had a page, so the day it signs up every one of them is a pair.
   *  Public surfaces drop this row and show the gym's, because the gym is the
   *  source of truth once it runs its own schedule; their own screen keeps it,
   *  because that is the only place they can hand it over. */
  duplicateOf: string | null;
};

type Who = { id: string; shiftsPublic: boolean };

const own = (r: typeof schema.classes.$inferSelect): ScheduleRow => ({
  ...r,
  ownerUserId: r.userId,
  shift: false,
  duplicateOf: null,
});

/** One slot at one place, the same rule the overlap notice uses, plus the
 *  name. Day, time and studio alone would collapse the yoga room's six
 *  o'clock into the spin room's, and a false pair hides a real class. */
const slotKey = (r: {
  studioId: string | null;
  dayOfWeek: number;
  startTime: string;
  name: string;
}) => `${r.studioId}|${r.dayOfWeek}|${r.startTime}|${r.name.trim().toLowerCase()}`;

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
  const rows = await build(
    ids,
    who.filter((w) => w.shiftsPublic).map((w) => w.id),
  );
  // The gym's row is the one people see. Showing both is the double listing
  // this whole flag exists to stop.
  return rows.filter((r) => !r.duplicateOf);
}

/**
 * The same public schedule graph, without class photos.
 *
 * Calendar feeds never render the class image from their server payload: the
 * detail sheet fetches it only when somebody opens a class. Older images are
 * data URLs, so selecting one for every class across a large follow graph can
 * turn a small calendar response into several megabytes before recurrence
 * expansion even starts. Keep the full loader as the default for profile and
 * sharing surfaces, and give list-only callers an explicitly lightweight
 * path.
 */
export async function publicFeedSchedules(who: Who[]): Promise<ScheduleRow[]> {
  const ids = [...new Set(who.map((w) => w.id))];
  if (!ids.length) return [];
  const rows = await build(
    ids,
    who.filter((w) => w.shiftsPublic).map((w) => w.id),
    true,
  );
  return rows.filter((r) => !r.duplicateOf);
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

const { image: _classImage, ...feedClassColumns } = getTableColumns(schema.classes);

async function selectClassesWithoutImages(
  db: Awaited<ReturnType<typeof getDb>>,
  where: SQL | undefined,
) {
  // Kept as a small helper so own rows, shifts and cover extras all use the
  // same projection. The `where` expression is deliberately accepted as the
  // query builder's runtime SQL shape; Drizzle validates it at `.where()`.
  const rows = await db.select(feedClassColumns).from(schema.classes).where(where);
  return rows.map((row) => ({ ...row, image: null })) as (typeof schema.classes.$inferSelect)[];
}

async function build(ids: string[], sharing: string[], withoutImages = false): Promise<ScheduleRow[]> {
  const db = await getDb();
  const ownWhere = inArray(schema.classes.userId, ids);
  const rows = withoutImages
    ? await selectClassesWithoutImages(db, ownWhere)
    : await db.select().from(schema.classes).where(ownWhere);
  const out = rows.map(own);
  if (!sharing.length) return out;

  // Slots these coaches are on at a gym. Their own rows are already in hand,
  // and a coach can't be on their own class in the rota sense.
  const shiftsWhere = and(
    inArray(schema.classes.coachUserId, sharing),
    ne(schema.classes.userId, schema.classes.coachUserId),
  );
  const shifts = withoutImages
    ? await selectClassesWithoutImages(db, shiftsWhere)
    : await db.select().from(schema.classes).where(shiftsWhere);
  const mine = new Set(rows.map((r) => r.id));
  const standing = shifts.filter((s) => !mine.has(s.id));

  // The exceptions. A cover wins over the class for its one date, so a date
  // somebody else took has to come off this coach's week, and a date they were
  // handed has to come onto it, even on a slot they don't normally teach.
  // We need both sides of a cover: exceptions to a coach's standing slots,
  // plus dates handed *to* them from somebody else's slot. The latter must be
  // queried by coach id; only loading covers for standing rows made a cover
  // disappear from the receiving coach's calendar.
  const [standingCovers, receivedCovers] = await Promise.all([
    standing.length
      ? db
          .select()
          .from(schema.shiftCovers)
          .where(inArray(schema.shiftCovers.classId, standing.map((row) => row.id)))
      : Promise.resolve([]),
    db
      .select()
      .from(schema.shiftCovers)
      .where(inArray(schema.shiftCovers.coachUserId, sharing)),
  ]);
  const covers = [...new Map([...standingCovers, ...receivedCovers].map((cover) => [cover.id, cover])).values()];
  const sharingSet = new Set(sharing);
  const takenAway = new Map<string, string[]>();
  const handedOver: typeof covers = [];
  const standingById = new Map(standing.map((s) => [s.id, s]));
  for (const cv of covers) {
    const s = standingById.get(cv.classId);
    // A cover changes who is on a standing slot, even when both the usual and
    // substitute coaches are being shown together.
    if (s && cv.coachUserId !== s.coachUserId) {
      const list = takenAway.get(cv.classId) ?? [];
      list.push(cv.occurrenceDate);
      takenAway.set(cv.classId, list);
    }
    if (cv.coachUserId && sharingSet.has(cv.coachUserId)) handedOver.push(cv);
  }

  for (const s of standing) {
    const off = takenAway.get(s.id) ?? [];
    out.push({
      ...s,
      skipDates: off.length ? [...new Set([...s.skipDates, ...off])].sort() : s.skipDates,
      ownerUserId: s.coachUserId!,
      shift: true,
      duplicateOf: null,
    });
  }

  // Pair each coach's own row with the gym row that has taken it over. Scoped
  // per coach: two coaches at one studio listing the same slot is a different
  // problem, and the overlap notice already tells them both about it.
  const gymSlots = new Map<string, string>();
  for (const s of standing) if (s.studioId) gymSlots.set(`${s.coachUserId}|${slotKey(s)}`, s.id);
  for (const r of out) {
    if (r.shift || !r.studioId) continue;
    const gym = gymSlots.get(`${r.ownerUserId}|${slotKey(r)}`);
    if (gym) r.duplicateOf = gym;
  }

  // A date handed to a coach on a slot somebody else normally teaches has no
  // standing row to hang off, so it becomes the one-off it actually is.
  const extraIds = [...new Set(handedOver.map((c) => c.classId))].filter(
    (id) => !standingById.has(id) && !mine.has(id),
  );
  const extras = extraIds.length
    ? withoutImages
      ? await selectClassesWithoutImages(db, inArray(schema.classes.id, extraIds))
      : await db.select().from(schema.classes).where(inArray(schema.classes.id, extraIds))
    : [];
  const extraById = new Map(extras.map((e) => [e.id, e]));
  for (const cv of handedOver) {
    const cls = standingById.get(cv.classId) ?? extraById.get(cv.classId);
    if (!cls || !cv.coachUserId) continue;
    // This coach already owns the standing slot. The cover adds no date to
    // their calendar; it only matters when it took the date away.
    if (cls.coachUserId === cv.coachUserId) continue;
    out.push({
      ...cls,
      dayOfWeek: dowOfDate(cv.occurrenceDate),
      specificDate: cv.occurrenceDate,
      endsOn: null,
      skipDates: [],
      ownerUserId: cv.coachUserId,
      shift: true,
      duplicateOf: null,
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

/** Who to name on a gym's class, per date. */
export type ShiftNaming = {
  /** The coach who normally teaches a slot, keyed by class id. */
  standing: Map<string, typeof schema.users.$inferSelect>;
  /** A single date somebody else took, keyed `${classId}|${iso}`. Present and
   *  null means the date is covered by nobody we may name: an open slot, or a
   *  coach who does not show their shifts. It must not fall back to the
   *  standing coach, who is not on that date. */
  perDate: Map<string, typeof schema.users.$inferSelect | null>;
};

/**
 * The person behind a gym's class, where they have said their shifts are
 * theirs to show.
 *
 * A shift is a row the gym owns with a coach on it, so every surface built
 * from `classes.userId` named the gym: a member's calendar drew "Ironbound"
 * where the coach chip goes and "Ironbound" again as the place, and the coach
 * they followed to find the class was nowhere on it. The person is on
 * `classes.coachUserId`, with a `shift_covers` row winning for one date the
 * way it does everywhere else.
 *
 * It is gated on that coach's own `shiftsPublic`, and that gate is the whole
 * privacy argument. With it on they have already published the shift as
 * theirs and it carries their name on their own public page, so naming them
 * here says a fact they published in the place somebody is reading it. With
 * it off, a gym's schedule naming them would be new information, and whether
 * a gym's schedule names anybody is the gym's call rather than ours: the row
 * stays the gym's, exactly as before.
 */
export async function shiftNaming(classIds: string[]): Promise<ShiftNaming> {
  const empty: ShiftNaming = { standing: new Map(), perDate: new Map() };
  if (!classIds.length) return empty;
  const db = await getDb();
  const [rows, covers] = await Promise.all([
    db
      .select({ id: schema.classes.id, coachUserId: schema.classes.coachUserId })
      .from(schema.classes)
      .where(inArray(schema.classes.id, classIds)),
    db.select().from(schema.shiftCovers).where(inArray(schema.shiftCovers.classId, classIds)),
  ]);
  const ids = [
    ...new Set(
      [...rows.map((r) => r.coachUserId), ...covers.map((c) => c.coachUserId)].filter(
        (x): x is string => !!x,
      ),
    ),
  ];
  if (!ids.length) return empty;
  const people = await db.select().from(schema.users).where(inArray(schema.users.id, ids));
  const nameable = new Map(people.filter((u) => u.shiftsPublic).map((u) => [u.id, u]));

  const standing = new Map<string, typeof schema.users.$inferSelect>();
  for (const r of rows) {
    const u = r.coachUserId ? nameable.get(r.coachUserId) : undefined;
    if (u) standing.set(r.id, u);
  }
  const perDate = new Map<string, typeof schema.users.$inferSelect | null>();
  for (const c of covers) {
    perDate.set(
      `${c.classId}|${c.occurrenceDate}`,
      (c.coachUserId ? nameable.get(c.coachUserId) : null) ?? null,
    );
  }
  return { standing, perDate };
}

/** The coach to name on one date, or null to leave the row the gym's. */
export function shiftCoach(n: ShiftNaming, classId: string, iso: string) {
  const key = `${classId}|${iso}`;
  if (n.perDate.has(key)) return n.perDate.get(key) ?? null;
  return n.standing.get(classId) ?? null;
}
