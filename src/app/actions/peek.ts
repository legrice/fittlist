"use server";

import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { isBlocked } from "@/lib/blocks";
import { publicSchedules, shiftNaming } from "@/lib/coachweek";
import { clockParts, fmtDayHeaderRel, occurrenceEnded, runsOn, todayIso } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";

/** A class in a coach's peek, and whether it is already on your week. */
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
  saved: boolean;
};

export type PeekDay = { iso: string; label: string; items: PeekItem[] };

export type Peek = {
  name: string;
  handle: string | null;
  photo: string | null;
  color: string;
  days: PeekDay[];
};

/** How far the peek looks. A fortnight, not the calendar's nine weeks: this is
 *  a glance at what somebody has on, and a list you scroll for two months is a
 *  page rather than a peek. */
const PEEK_DAYS = 14;

/**
 * A coach's week, as the thing you save from.
 *
 * This is the whole of what following buys now, so it has to be the easy path:
 * open a face, see what they have on, save the ones you are going to, dismiss.
 * Saving from here is what puts a class on your calendar, which is the change
 * the pull model is testing.
 *
 * It asks `publicSchedules`, the same loader the coach's own page and the
 * digests ask, so a coach's week cannot say one thing in the peek and another
 * on their page. Shifts come with it where they show them, and the rota's
 * coach names the row the way it does everywhere else.
 */
export async function coachPeek(coachUserId: string): Promise<Peek | null> {
  const viewerId = await getSessionUserId();
  if (!viewerId) return null;
  const db = await getDb();
  const [coach] = await db.select().from(schema.users).where(eq(schema.users.id, coachUserId));
  if (!coach) return null;
  // Blocked in either direction: as far as they are concerned, no such week.
  if (await isBlocked(coachUserId, viewerId)) return null;

  const rows = await publicSchedules([{ id: coach.id, shiftsPublic: coach.shiftsPublic }]);
  const marks = new Set(
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

  const studioIds = [...new Set(rows.map((r) => r.studioId).filter((s): s is string => !!s))];
  const studios = studioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds))
    : [];
  const studioById = new Map(studios.map((s) => [s.id, s]));
  const naming = await shiftNaming(rows.filter((r) => r.shift).map((r) => r.id));

  const days: PeekDay[] = [];
  const day = new Date(`${todayIso()}T00:00:00Z`);
  for (let i = 0; i < PEEK_DAYS; i++) {
    const iso = day.toISOString().slice(0, 10);
    const dow = (day.getUTCDay() + 6) % 7;
    day.setUTCDate(day.getUTCDate() + 1);
    const items: PeekItem[] = [];
    for (const c of rows) {
      if (!runsOn(c, iso, dow)) continue;
      if (occurrenceEnded(iso, c.startTime, c.durationMin)) continue;
      const st = c.studioId ? studioById.get(c.studioId) : null;
      // A shift lives under the studio, because the gym owns the class.
      const base = c.shift ? (st?.slug ? `s/${st.slug}` : null) : coach.handle;
      if (!base) continue;
      const t = clockParts(c.startTime);
      items.push({
        classId: c.id,
        iso,
        name: c.name,
        hm: t.hm,
        ap: t.ap,
        durationMin: c.durationMin,
        where: st?.name ?? c.location,
        base,
        saved: marks.has(`${c.id}|${iso}`),
      });
    }
    if (items.length)
      days.push({
        iso,
        // The same words the calendar underneath uses, Today and Tomorrow
        // included: a peek that says "Wednesday" over a week that says "Today"
        // is one day named two ways on two screens a tap apart.
        label: fmtDayHeaderRel(iso),
        items: items.sort((a, b) => a.hm.localeCompare(b.hm)),
      });
  }

  // The header names the coach whose circle was tapped, never whoever the rota
  // has on the first row: a covered date can belong to somebody else, and this
  // sheet answers "what has Erin got on", not "who is working".
  return {
    name: coach.name.trim() || coach.email.split("@")[0],
    handle: coach.handle,
    photo: coach.photo,
    color: avatarColor(coach),
    days,
  };
}
