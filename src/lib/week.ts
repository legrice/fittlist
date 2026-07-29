import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { clockParts, fmtDayHeader } from "@/lib/format";

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
};

export type WeekDay = { iso: string; label: string; items: WeekItem[] };

/** Today, as the server sees it. Everything here is date-only. */
const todayIso = () => new Date().toISOString().slice(0, 10);

/** How many added classes are still ahead of them. */
export async function weekCount(userId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.attendances.id })
    .from(schema.attendances)
    .where(
      and(
        eq(schema.attendances.userId, userId),
        gte(schema.attendances.occurrenceDate, todayIso()),
      ),
    );
  return rows.length;
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
  if (marks.length === 0) return [];

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

  const studioIds = [...new Set(classRows.map((c) => c.studioId).filter((s): s is string => !!s))];
  const studios = studioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds))
    : [];
  const studioById = new Map(studios.map((s) => [s.id, s]));

  const byDay = new Map<string, WeekItem[]>();
  for (const m of marks) {
    const c = classById.get(m.classId);
    // A class deleted out from under a mark leaves the mark behind for a
    // moment. Skip it rather than rendering a row with nothing in it.
    if (!c) continue;
    const coach = coachById.get(c.userId);
    if (!coach?.handle) continue;
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
      handle: coach.handle,
      coachName: coach.name,
      coachPhoto: coach.photo,
      coachColor: avatarColor(coach),
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
