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
// There was a second hat here: a week of the classes you were going to,
// deliberately never merged with the week you teach, because promoting your
// own classes and showing where you train are two different posts. Going marks
// are gone from the app, so there is one hat and the segment that picked
// between them came off the composer with it.

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

  // The same rows the coach's public page draws, so the picture and the page
  // it points at can't disagree. Shifts ride along exactly when the coach has
  // said they may.
  //
  // There was a second branch here, for a week of classes you were going to.
  // It is gone with the going marks and the personal entries that fed it: a
  // member has no calendar of their own now, so there is no second week to
  // draw and nothing on this path forks by kind any more.
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
