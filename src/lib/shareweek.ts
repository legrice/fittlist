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
// One week per person, decided by kind rather than by a hat segment: a
// coach's picture is the week they teach, a member's is the week they are
// going to (their marks at real classes, plus the entries they typed). The
// two never merge, because promoting your own classes and showing where you
// train are two different posts, and each kind only has the one.

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
  /** One of the member's own entries: the hub offers an edit for these,
   *  and only these, because a mark points at somebody else's class. */
  own?: boolean;
  /** A class the person leads. The picker tags rows with it, and on the
   *  image it is the one word a row carries: tag only the classes you are
   *  coaching, leave the rest bare, per the brief. */
  coaching?: boolean;
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

  if (me.kind === "fan") {
    // The member's week: the marks they made at real classes, and the
    // entries they typed themselves. This branch was deleted when the
    // member calendar went, and it is back by Matt's call as the Share
    // tab's whole subject: a member builds the week they are going to and
    // shares it, and this loader is what the picture and the picker both
    // read. Their profile page draws the same rows through `sharedWeek`.
    const [marks, own] = await Promise.all([
      db.select().from(schema.attendances).where(eq(schema.attendances.userId, userId)),
      db.select().from(schema.personalClasses).where(eq(schema.personalClasses.userId, userId)),
    ]);
    const marked = marks.filter((m) => inRange.has(m.occurrenceDate));
    const classRows = marked.length
      ? (
          await db
            .select()
            .from(schema.classes)
            .where(inArray(schema.classes.id, [...new Set(marked.map((m) => m.classId))]))
        ).filter((c) => c.isPublic)
      : [];
    const classById = new Map(classRows.map((c) => [c.id, c]));
    const coachRows = classRows.length
      ? await db
          .select({ id: schema.users.id, name: schema.users.name })
          .from(schema.users)
          .where(inArray(schema.users.id, [...new Set(classRows.map((c) => c.userId))]))
      : [];
    const coachName = new Map(coachRows.map((u) => [u.id, u.name.split(/\s+/)[0]]));
    const names = await studioNames([
      ...classRows.map((c) => c.studioId),
      ...own.map((p) => p.studioId),
    ]);
    for (const m of marked) {
      const c = classById.get(m.classId);
      if (!c) continue;
      put(
        m.occurrenceDate,
        {
          time: fmtTime(c.startTime),
          startTime: c.startTime,
          name: c.name,
          where: (c.studioId && names.get(c.studioId)) || c.location || "",
          who: coachName.get(c.userId) ?? "",
        },
        c.id,
      );
    }
    for (const iso of dates) {
      const dow = dowOf(iso);
      for (const p of own) {
        if (!runsOn({ ...p, skipDates: [] as string[] }, iso, dow)) continue;
        put(
          iso,
          {
            time: fmtTime(p.startTime),
            startTime: p.startTime,
            name: p.name,
            where: (p.studioId && names.get(p.studioId)) || p.location || "",
            who: p.withWho || "",
            own: true,
          },
          p.id,
        );
      }
    }
  } else {
    // The same rows the coach's public page draws, so the picture and the
    // page it points at can't disagree. Shifts ride along exactly when the
    // coach has said they may. The saved half rides beside them now, per
    // the brief: a coach's week is both hats, and the picker's shortcuts
    // are what tell them apart.
    const [rows, marks, own] = await Promise.all([
      publicSchedule(me).then((r) => r.filter((c) => c.isPublic)),
      db.select().from(schema.attendances).where(eq(schema.attendances.userId, userId)),
      db.select().from(schema.personalClasses).where(eq(schema.personalClasses.userId, userId)),
    ]);
    const marked = marks.filter((m) => inRange.has(m.occurrenceDate));
    const markedRows = marked.length
      ? (
          await db
            .select()
            .from(schema.classes)
            .where(inArray(schema.classes.id, [...new Set(marked.map((m) => m.classId))]))
        ).filter((c) => c.isPublic)
      : [];
    const markedById = new Map(markedRows.map((c) => [c.id, c]));
    const markedCoaches = markedRows.length
      ? await db
          .select({ id: schema.users.id, name: schema.users.name })
          .from(schema.users)
          .where(inArray(schema.users.id, [...new Set(markedRows.map((c) => c.userId))]))
      : [];
    const markedName = new Map(markedCoaches.map((u) => [u.id, u.name.split(/\s+/)[0]]));
    const names = await studioNames([
      ...rows.map((c) => c.studioId),
      ...markedRows.map((c) => c.studioId),
      ...own.map((p) => p.studioId),
    ]);
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
            coaching: true,
          },
          c.id,
        );
      }
      for (const p of own) {
        if (!runsOn({ ...p, skipDates: [] as string[] }, iso, dow)) continue;
        put(
          iso,
          {
            time: fmtTime(p.startTime),
            startTime: p.startTime,
            name: p.name,
            where: (p.studioId && names.get(p.studioId)) || p.location || "",
            who: p.withWho || "",
            own: true,
          },
          p.id,
        );
      }
    }
    for (const m of marked) {
      const c = markedById.get(m.classId);
      if (!c) continue;
      put(
        m.occurrenceDate,
        {
          time: fmtTime(c.startTime),
          startTime: c.startTime,
          name: c.name,
          where: (c.studioId && names.get(c.studioId)) || c.location || "",
          who: markedName.get(c.userId) ?? "",
        },
        c.id,
      );
    }
  }

  return dates
    .filter((iso) => (byDate.get(iso) ?? []).length > 0)
    .map((iso) => ({
      iso,
      // "Wed Aug 6", no comma, by Matt's call: the kicker range came off
      // the poster, so each day heading carries its own date.
      day: `${DAYS[dowOf(iso)]} ${new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`,
      items: (byDate.get(iso) ?? []).sort(
        (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
      ),
    }));
}

