import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { publicSchedule } from "@/lib/coachweek";
import { DAYS, fmtTime, runsOn, timeToMinutes, todayIso as todayIsoNow } from "@/lib/format";

// What goes on a share image, for a range and one of the two hats.
//
// The composer and the image route have to agree about this down to the last
// row: the picker says "3 of 5 showing" and the picture has to be those three.
// They were always going to drift as two queries, so there is one, and both
// call it. The image route is a separate HTTP request from the screen that
// asked for it, so "share the state" means "share the loader" rather than
// "pass the rows along".
//
// The two hats are deliberately not one merged list. A coach promoting the
// classes they teach and a coach showing where they train are two different
// posts with two different asks, and a picture that mixes them makes neither.

/** Coaching is what you teach; going is what you attend, your own entries
 *  included. A member only ever has the second. */
export type ShareKind = "coaching" | "going";

export type ShareItem = {
  /** Stable across a reload, and what the hide list is keyed on: a class row
   *  id alone is not enough, because one weekly class is one row on several
   *  dates and hiding Tuesday must not hide Thursday. */
  key: string;
  iso: string;
  /** Already formatted for the eye, e.g. "6:30a". */
  time: string;
  /** For sorting only; the eye gets `time`. */
  startTime: string;
  name: string;
  /** The studio or place. "" when there isn't one. */
  where: string;
  /** A coach's first name, on a member's picture. "" on a coach's own. */
  who: string;
};

export type ShareDay = { iso: string; day: string; items: ShareItem[] };

/** The dates a range covers, oldest first. */
export function rangeDates(from: string, days: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    out.push(new Date(Date.parse(`${from}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10));
  }
  return out;
}

/** A start date and a length, clamped to what the canvas can hold. Seven days
 *  is the ceiling because past that it stops being a schedule people read;
 *  one is the floor because "I'm at this tonight" is a real thing to post. */
export function shareRange(fromRaw: string | null, daysRaw: string | null) {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromRaw ?? "") ? fromRaw! : todayIsoNow();
  const days = Math.min(7, Math.max(1, Number(daysRaw) || 7));
  return { from, days };
}

const dowOf = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;

/**
 * Everything in range, grouped by day, days with nothing on them dropped.
 *
 * `hide` is a set of item keys the picture leaves out. Hiding is the image's
 * business only: nothing here writes, and the class stays on the calendar,
 * which is the promise the picker sheet makes in as many words.
 */
export async function shareWeek(
  userId: string,
  kind: ShareKind,
  from: string,
  days: number,
  hide: Set<string> = new Set(),
): Promise<ShareDay[]> {
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return [];
  const dates = rangeDates(from, days);
  const inRange = new Set(dates);

  const byDate = new Map<string, ShareItem[]>();
  const put = (iso: string, it: Omit<ShareItem, "key" | "iso">, id: string) => {
    const key = `${id}.${iso}`;
    if (hide.has(key)) return;
    byDate.set(iso, [...(byDate.get(iso) ?? []), { ...it, key, iso }]);
  };

  // The studio names every branch below needs, looked up once at the end.
  const studioNames = async (ids: (string | null)[]) => {
    const list = [...new Set(ids.filter((x): x is string => !!x))];
    if (!list.length) return new Map<string, string>();
    const rows = await db.select().from(schema.studios).where(inArray(schema.studios.id, list));
    return new Map(rows.map((s) => [s.id, s.name]));
  };

  if (kind === "coaching") {
    // The same rows the coach's public page draws, so the picture and the page
    // it points at can't disagree. Shifts ride along exactly when the coach
    // has said they may.
    const rows = (await publicSchedule(me)).filter((c) => c.isPublic);
    const names = await studioNames(rows.map((c) => c.studioId));
    for (const iso of dates) {
      const dow = dowOf(iso);
      for (const c of rows) {
        if (!runsOn(c, iso, dow)) continue;
        put(
          iso,
          {
            time: fmtTime(c.startTime),
            startTime: c.startTime,
            name: c.name,
            where: (c.studioId && names.get(c.studioId)) || c.location || "",
            who: "",
          },
          c.id,
        );
      }
    }
  } else {
    // Both halves of a week: the classes marked at a coach, and the entries
    // they keep themselves. A picture that quietly dropped half of somebody's
    // week is worse than no picture, and their own entries are exactly the
    // ones whose coach isn't here yet.
    const [going, own] = await Promise.all([
      db
        .select({
          classId: schema.attendances.classId,
          occurrenceDate: schema.attendances.occurrenceDate,
        })
        .from(schema.attendances)
        .where(eq(schema.attendances.userId, userId)),
      db.select().from(schema.personalClasses).where(eq(schema.personalClasses.userId, userId)),
    ]);
    const classIds = [...new Set(going.map((g) => g.classId))];
    const classRows = classIds.length
      ? (await db.select().from(schema.classes).where(inArray(schema.classes.id, classIds))).filter(
          (c) => c.isPublic,
        )
      : [];
    const coachIds = [...new Set(classRows.map((c) => c.userId))];
    const coaches = coachIds.length
      ? await db.select().from(schema.users).where(inArray(schema.users.id, coachIds))
      : [];
    const coachById = new Map(coaches.map((c) => [c.id, c]));
    const names = await studioNames([
      ...classRows.map((c) => c.studioId),
      ...own.map((p) => p.studioId),
    ]);
    const classById = new Map(classRows.map((c) => [c.id, c]));

    for (const g of going) {
      const c = classById.get(g.classId);
      if (!c || !inRange.has(g.occurrenceDate)) continue;
      put(
        g.occurrenceDate,
        {
          time: fmtTime(c.startTime),
          startTime: c.startTime,
          name: c.name,
          where: (c.studioId && names.get(c.studioId)) || c.location || "",
          who: coachById.get(c.userId)?.name?.trim().split(/\s+/)[0] ?? "",
        },
        c.id,
      );
    }
    for (const p of own) {
      for (const iso of dates) {
        if (!runsOn(p, iso, dowOf(iso))) continue;
        put(
          iso,
          {
            time: fmtTime(p.startTime),
            startTime: p.startTime,
            name: p.name,
            where: (p.studioId && names.get(p.studioId)) || p.location || "",
            who: p.withWho.trim().split(/\s+/)[0] ?? "",
          },
          p.id,
        );
      }
    }
  }

  return dates
    .filter((iso) => (byDate.get(iso) ?? []).length > 0)
    .map((iso) => ({
      iso,
      day: DAYS[dowOf(iso)],
      items: (byDate.get(iso) ?? []).sort(
        (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
      ),
    }));
}

/** The label over the picture. A single day names itself, a Monday-led seven
 *  is a week, and anything else names both of its ends. */
export function shareKicker(from: string, days: number): string {
  const short = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  const dates = rangeDates(from, days);
  const last = dates[dates.length - 1];
  if (days === 1)
    return new Date(`${from}T00:00:00Z`).toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  // Sunday is the app's first day of the week everywhere it draws a grid, so
  // a seven starting on one is "the week" and anything else is a range.
  if (days === 7 && new Date(`${from}T00:00:00Z`).getUTCDay() === 0) return `Week of ${short(from)}`;
  return `${short(from)} to ${short(last)}`;
}
