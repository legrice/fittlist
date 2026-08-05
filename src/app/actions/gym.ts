"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import {
  DAYS,
  dowOfDate,
  fmtDateLong,
  fmtDayHeader,
  fmtDays,
  fmtTime,
  mondayOfCurrentWeek,
  occurrenceEnded,
  runsOn,
  timeToMinutes,
  todayIso,
} from "@/lib/format";
import { addNotification } from "@/lib/notify";
import { sendableAt, type Sendable } from "@/lib/rota";
import { getSessionUserId } from "@/lib/session";
import { studioAccess } from "@/lib/studioaccess";

// A gym's own schedule: the rota, replacing the spreadsheet.
//
// The class belongs to the gym, not to whoever is teaching it. That inversion
// is the point. A gym can publish its week without naming anybody (a schedule
// is not a popularity contest), a coach can take shifts without wanting a
// public profile at all, and a member can add every class at the gym whether
// or not one single coach uses the app. `classes.userId` is the gym's account
// and `classes.coachUserId` is the rota.
//
// One row is one slot, mirroring the spreadsheet's one cell per class. Adding
// Monday and Wednesday at once makes two rows sharing a series, and each is
// then its own slot with its own person on it, because that is what a rota is.
// An edit is about the slot that was opened and updates it in place: unlike a
// coach's save, nothing here deletes and reinserts a row, so a Going mark or a
// swap on it is never at risk.

export type GymClassDto = {
  id: string;
  name: string;
  classType: string | null;
  dayOfWeek: number;
  /** Set = a one-off pinned to this date (a workshop, a seminar). */
  specificDate: string | null;
  /** Last date a standing weekly slot runs. */
  endsOn: string | null;
  startTime: string;
  durationMin: number;
  description: string | null;
  image: string | null;
  links: { label: string; url: string }[];
  /** Who normally teaches it, week in week out. */
  coachUserId: string | null;
  coachName: string;
  /** Who is actually on it this date, once covers are applied. */
  onUserId: string | null;
  onName: string;
  /** This date is an exception to the standing rota. */
  covered: boolean;
};

export type GymDayDto = { iso: string; label: string; items: GymClassDto[] };
export type GymWeekDto = {
  /** Monday of the week being shown, and how far it is from this one. */
  monday: string;
  offset: number;
  label: string;
  days: GymDayDto[];
};

export type GymCoachDto = { id: string; name: string; email: string };

/** The gym account behind a studio, and whether this caller may act for it. */
async function actingFor(studioId: string) {
  const userId = await getSessionUserId();
  if (!userId) return { error: "Session expired." as const };
  const db = await getDb();
  const [me] = await db
    .select({ kind: schema.users.kind })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me) return { error: "Session expired." as const };
  const [studio] = await db.select().from(schema.studios).where(eq(schema.studios.id, studioId));
  if (!studio) return { error: "Studio not found." as const };
  const access = await studioAccess(studioId, { id: userId, kind: me.kind });
  // Running the rota is for the people who run the place, not for anyone who
  // may correct a directory entry. An unclaimed studio has no rota at all.
  if (!access.isManager) return { error: "Only the people who run this studio can do that." as const };
  if (!studio.accountUserId) return { error: "This studio isn't running its schedule yet." as const };
  return { db, userId, studio, gymId: studio.accountUserId };
}

/** Everyone who could take a shift: the coaches who teach here. */
export async function gymCoaches(studioId: string): Promise<GymCoachDto[]> {
  const ctx = await actingFor(studioId);
  if ("error" in ctx) return [];
  const { db } = ctx;
  // The same union the studio page uses for "Coaches here": picked the studio
  // in setup, or has a class at it. A gym adds people by having them list the
  // place they work, which they have already done.
  const [picked, classRows] = await Promise.all([
    db
      .select({ userId: schema.coachStudios.userId })
      .from(schema.coachStudios)
      .where(eq(schema.coachStudios.studioId, studioId)),
    db
      .select({ userId: schema.classes.userId })
      .from(schema.classes)
      .where(eq(schema.classes.studioId, studioId)),
  ]);
  const ids = [...new Set([...picked, ...classRows].map((r) => r.userId))];
  if (!ids.length) return [];
  const people = await db.select().from(schema.users).where(inArray(schema.users.id, ids));
  return people
    .filter((p) => p.kind !== "fan" && p.kind !== "gym")
    .map((p) => ({ id: p.id, name: p.name.trim() || p.email.split("@")[0], email: p.email }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type RotaPoolDto = { id: string; name: string; inPool: boolean };

/**
 * The shift list, for the manager: every coach who says they teach here, and
 * whether the gym has named them able to take shifts.
 *
 * The candidates come from the same union as everything else (they listed the
 * place), but the list itself is the gym's own claim: anyone may say they
 * coach at a gym, and not everyone who does teaches the group classes on the
 * rota. A coach handing a date on picks from this list and nobody else.
 */
export async function rotaPool(studioId: string): Promise<RotaPoolDto[]> {
  const ctx = await actingFor(studioId);
  if ("error" in ctx) return [];
  const { db } = ctx;
  const [candidates, pool] = await Promise.all([
    gymCoaches(studioId),
    db
      .select()
      .from(schema.studioRotaCoaches)
      .where(eq(schema.studioRotaCoaches.studioId, studioId)),
  ]);
  const inPool = new Set(pool.map((r) => r.userId));
  return candidates.map((c) => ({ id: c.id, name: c.name, inPool: inPool.has(c.id) }));
}

/** Put a coach on the shift list, or take them off. Managers only. */
export async function setRotaCoach(
  studioId: string,
  userId: string,
  on: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await actingFor(studioId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { db, studio } = ctx;
  if (on) {
    const [person] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    if (!person || person.kind === "fan" || person.kind === "gym")
      return { ok: false, error: "That's not a coach." };
    if (!(await coachesHere(db, studioId)).has(userId))
      return { ok: false, error: "They don't list this studio." };
    await db
      .insert(schema.studioRotaCoaches)
      .values({ studioId, userId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(schema.studioRotaCoaches)
      .where(
        and(
          eq(schema.studioRotaCoaches.studioId, studioId),
          eq(schema.studioRotaCoaches.userId, userId),
        ),
      );
  }
  revalidatePath(`/s/${studio.slug ?? studio.id}/manage`);
  return { ok: true };
}

/**
 * A real week of the rota, dates and all, because a swap is about a date. The
 * standing slots are expanded with runsOn (the same predicate every surface
 * uses) and then any cover for that date is laid over the top.
 */
export async function gymSchedule(studioId: string, offset = 0): Promise<GymWeekDto | null> {
  const ctx = await actingFor(studioId);
  if ("error" in ctx) return null;
  const { db, gymId } = ctx;

  const week = Math.max(0, Math.min(8, Math.trunc(offset) || 0));
  const start = new Date(`${mondayOfCurrentWeek()}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + week * 7);
  const monday = start.toISOString().slice(0, 10);
  const isoOf = (i: number) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  };

  const rows = await db
    .select()
    .from(schema.classes)
    .where(and(eq(schema.classes.userId, gymId), eq(schema.classes.studioId, studioId)));

  const covers = rows.length
    ? await db
        .select()
        .from(schema.shiftCovers)
        .where(inArray(schema.shiftCovers.classId, rows.map((r) => r.id)))
    : [];
  const coverBy = new Map(covers.map((c) => [`${c.classId}|${c.occurrenceDate}`, c]));

  const ids = new Set<string>();
  for (const r of rows) if (r.coachUserId) ids.add(r.coachUserId);
  for (const c of covers) if (c.coachUserId) ids.add(c.coachUserId);
  const people = ids.size
    ? await db.select().from(schema.users).where(inArray(schema.users.id, [...ids]))
    : [];
  const nameOf = new Map(
    people.map((p) => [p.id, p.name.trim() || p.email.split("@")[0]] as const),
  );

  const days: GymDayDto[] = [];
  for (let i = 0; i < 7; i++) {
    const iso = isoOf(i);
    const dow = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
    const items = rows
      .filter((r) => runsOn(r, iso, dow))
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
      .map((r) => {
        const cover = coverBy.get(`${r.id}|${iso}`);
        const onUserId = cover ? cover.coachUserId : r.coachUserId;
        return {
          id: r.id,
          name: r.name,
          classType: r.classType,
          dayOfWeek: r.dayOfWeek,
          specificDate: r.specificDate,
          endsOn: r.endsOn,
          startTime: r.startTime,
          durationMin: r.durationMin,
          description: r.description,
          image: r.image,
          links: r.links,
          coachUserId: r.coachUserId,
          coachName: (r.coachUserId && nameOf.get(r.coachUserId)) || "",
          onUserId,
          onName: (onUserId && nameOf.get(onUserId)) || "",
          covered: !!cover,
        };
      });
    days.push({ iso, label: fmtDayHeader(iso), items });
  }

  return {
    monday,
    offset: week,
    label: week === 0 ? "This week" : week === 1 ? "Next week" : `Week of ${fmtDayHeader(monday)}`,
    days,
  };
}

/**
 * The same shape the coach's adder sends, because it is the same adder. A gym
 * fills in a class the way a coach does: name, type, description, the days it
 * runs, when it starts and how long, where a member books it. The one field
 * that is only a gym's is `coachUserId`, which is the rota.
 */
export type GymClassInput = {
  name: string;
  classType?: string | null;
  description?: string | null;
  image?: string | null;
  /** 0 = Monday. Adding several makes several slots; one row is one slot. */
  days: number[];
  /** Set = a one-off pinned to this ISO date rather than a standing weekly. */
  specificDate?: string | null;
  /** Weekly only: the last date it runs. */
  endsOn?: string | null;
  startTime: string;
  /** Every time this class runs on the days picked, `startTime` included.
   *  A gym's week is a grid: Guns, Buns and Lungs runs Mon/Wed/Fri at five
   *  times and Tue/Thu at four, which is 23 slots of one class. Days times
   *  times is how that gets typed once instead of 23 times. Omitted or empty
   *  means just `startTime`, which is what every existing caller passes. */
  times?: string[];
  durationMin: number;
  /** Where a member books it. A gym usually has one, on every class. */
  links?: { label: string; url: string }[];
  coachUserId?: string | null;
};

/** A class already described at this studio, ready to be pulled in. */
export type GymCatalogItem = {
  name: string;
  classType: string | null;
  description: string | null;
  /** The picture belongs to the class rather than to whoever wrote it down
   *  first, so pulling one in brings it. The coach path has always carried
   *  this; the gym path dropped it in every direction, which meant a manager
   *  filling a rota re-picked a photo the studio already had, and lost it on
   *  save. */
  image: string | null;
  /** How long it runs. A gym filling a week types the same 60 over and over
   *  otherwise, and the length is a fact about the class rather than about
   *  one slot. Null where nothing has recorded one yet. */
  durationMin: number | null;
  links: { label: string; url: string }[];
};

/**
 * What has already been written down about the classes at this studio.
 *
 * The shared catalogue (`studio_classes`) carries the name, type and
 * description that any coach here has filled in. Booking links live on the
 * classes themselves, and unlike a coach reusing another coach's class, a gym
 * pulling in its own studio's link is the same booking page either way, so
 * they come along.
 */
export async function gymCatalog(studioId: string): Promise<GymCatalogItem[]> {
  const ctx = await actingFor(studioId);
  if ("error" in ctx) return [];
  const { db } = ctx;

  const [cat, atStudio] = await Promise.all([
    db
      .select()
      .from(schema.studioClasses)
      .where(eq(schema.studioClasses.studioId, studioId)),
    db.select().from(schema.classes).where(eq(schema.classes.studioId, studioId)),
  ]);

  const byKey = new Map<string, GymCatalogItem>();
  for (const c of cat)
    byKey.set(c.nameKey, {
      name: c.name,
      classType: c.classType,
      description: c.description,
      image: c.image,
      durationMin: c.durationMin,
      links: [],
    });
  // Real classes fill the gaps the catalogue doesn't hold, links above all.
  for (const c of atStudio) {
    if (!c.isPublic) continue;
    const key = c.name.trim().toLowerCase();
    const cur = byKey.get(key) ?? {
      name: c.name,
      classType: c.classType,
      description: c.description,
      image: c.image,
      durationMin: c.durationMin,
      links: [],
    };
    if (!cur.classType && c.classType) cur.classType = c.classType;
    if (!cur.description && c.description) cur.description = c.description;
    if (!cur.image && c.image) cur.image = c.image;
    if (!cur.durationMin && c.durationMin) cur.durationMin = c.durationMin;
    if (!cur.links.length && c.links.length) cur.links = c.links.map((l) => ({ ...l }));
    byKey.set(key, cur);
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Keep the studio's shared description of a class up to date. */
async function catalogue(
  db: Awaited<ReturnType<typeof getDb>>,
  studioId: string,
  userId: string,
  input: GymClassInput,
) {
  const name = input.name.trim();
  const classType = input.classType?.trim() || null;
  const description = input.description?.trim() || null;
  const image = input.image?.trim() || null;
  const durationMin = input.durationMin > 0 ? input.durationMin : null;
  try {
    await db
      .insert(schema.studioClasses)
      .values({
        studioId,
        name,
        nameKey: name.toLowerCase(),
        classType,
        description,
        image,
        durationMin,
        createdByUserId: userId,
      })
      .onConflictDoUpdate({
        target: [schema.studioClasses.studioId, schema.studioClasses.nameKey],
        set: {
          name,
          ...(classType ? { classType } : {}),
          ...(description ? { description } : {}),
          ...(image ? { image } : {}),
          ...(durationMin ? { durationMin } : {}),
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    console.error("studio catalog upsert failed", err);
  }
}

/** Links people paste: keep the real ones, drop the rest, cap the list. */
function cleanLinks(raw: GymClassInput["links"]): { label: string; url: string }[] {
  return (raw ?? [])
    .map((l) => ({ label: (l.label || "Book").trim().slice(0, 30), url: l.url.trim() }))
    .filter((l) => /^https?:\/\//i.test(l.url))
    .slice(0, 6);
}

/**
 * Every start time this add covers, deduped and in order.
 *
 * `startTime` is always one of them, so a caller that knows nothing about
 * `times` behaves exactly as it did. This is the only place that decides,
 * because the validator, the insert and the notification all have to agree on
 * how many slots are being made.
 */
function timesOf(input: GymClassInput): string[] {
  const all = [input.startTime, ...(input.times ?? [])]
    .map((t) => (t ?? "").trim())
    .filter((t) => /^\d{2}:\d{2}$/.test(t));
  return [...new Set(all)].sort();
}

/** A one-off is authoritative on its date; a weekly runs on the days picked. */
function shape(input: GymClassInput) {
  const oneOff = input.specificDate?.trim() || null;
  const days = oneOff
    ? [dowOfDate(oneOff)]
    : [...new Set(input.days ?? [])].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  return { oneOff, days, endsOn: oneOff ? null : input.endsOn?.trim() || null };
}

function validate(input: GymClassInput): string | null {
  if (!input.name.trim()) return "Give the class a name.";
  const oneOff = input.specificDate?.trim() || null;
  if (oneOff && !/^\d{4}-\d{2}-\d{2}$/.test(oneOff)) return "Pick a date.";
  const { days, endsOn } = shape(input);
  if (!days.length) return oneOff ? "Pick a date." : "Pick at least one day.";
  if (!/^\d{2}:\d{2}$/.test(input.startTime)) return "Pick a start time.";
  for (const t of input.times ?? [])
    if (!/^\d{2}:\d{2}$/.test((t ?? "").trim())) return "One of those times doesn't look right.";
  // The grid is days times times, so it grows quickly and a slip is expensive
  // to undo. A ceiling well above any real week is cheaper than a manager
  // discovering they made four hundred classes.
  if (shape(input).days.length * timesOf(input).length > 100)
    return "That's more than 100 classes at once. Split it into a few adds.";
  if (!Number.isInteger(input.durationMin) || input.durationMin < 5 || input.durationMin > 600)
    return "That length doesn't look right.";
  if (endsOn && !/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) return "That end date doesn't look right.";
  if (endsOn && endsOn < todayIso()) return "That end date has already passed.";
  return null;
}

/** "Mon, Wed & Fri 6:00am", or the date itself when it only runs once. Every
 *  time it runs, because a coach put on a class at five of them should be
 *  told about five of them rather than the earliest. */
function whenOf(input: GymClassInput): string {
  const { oneOff, days } = shape(input);
  const when = timesOf(input).map(fmtTime).join(", ");
  return oneOff ? `${fmtDateLong(oneOff)}, ${when}` : `${fmtDays(days)} ${when}`;
}

/** Tell a coach they are on, or that they are off. Silence is how a shift gets
 *  missed, which is the thing the spreadsheet did that cost somebody a class. */
async function tellCoach(
  coachUserId: string,
  studioName: string,
  className: string,
  when: string,
  on: boolean,
) {
  await addNotification(coachUserId, {
    type: on ? "shift_assigned" : "shift_dropped",
    title: on ? `You're coaching ${className}` : `You're off ${className}`,
    body: `${when} at ${studioName}.`,
    href: "/week",
  });
}

/** How an existing row reads when it's the one being taken away. */
const whenOfRow = (r: { dayOfWeek: number; specificDate: string | null; startTime: string }) =>
  r.specificDate
    ? `${fmtDateLong(r.specificDate)}, ${fmtTime(r.startTime)}`
    : `${DAYS[r.dayOfWeek]} ${fmtTime(r.startTime)}`;

export async function addGymClass(
  studioId: string,
  input: GymClassInput,
): Promise<{ ok: boolean; error?: string; count?: number }> {
  const ctx = await actingFor(studioId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const bad = validate(input);
  if (bad) return { ok: false, error: bad };
  const { db, studio, gymId } = ctx;

  const coachUserId = input.coachUserId || null;
  const name = input.name.trim();
  const { oneOff, days, endsOn } = shape(input);
  const times = timesOf(input);

  // What this studio already runs under this name, so a second pass over the
  // same class doesn't double the week. A manager will re-open a class to add
  // the times they forgot, and the honest answer to "Monday 6am again" is to
  // leave the slot that is already there alone: it may carry a coach, a swap
  // and a room full of members' plans.
  const existing = await db
    .select({ dayOfWeek: schema.classes.dayOfWeek, startTime: schema.classes.startTime })
    .from(schema.classes)
    .where(and(eq(schema.classes.userId, gymId), eq(schema.classes.name, name)));
  const taken = new Set(existing.map((r) => `${r.dayOfWeek}|${r.startTime.slice(0, 5)}`));

  // One row per day per time. Each row is still its own slot: the rota assigns
  // Monday and Wednesday separately, which is exactly what the spreadsheet's
  // cells did.
  //
  // A series per time rather than one for the whole grid, which keeps the rule
  // the rest of the app already follows (name, time, place and visibility
  // match). So "delete the whole thing" on the 6am removes the 6am on every
  // day it runs, and leaves the 7am standing. One series across all 23 slots
  // would make deleting a single time impossible to offer.
  const rows = [];
  for (const startTime of times) {
    const seriesId = randomUUID();
    for (const dayOfWeek of days) {
      if (!oneOff && taken.has(`${dayOfWeek}|${startTime}`)) continue;
      rows.push({
        userId: gymId,
        coachUserId,
        studioId,
        seriesId,
        dayOfWeek,
        specificDate: oneOff,
        endsOn,
        startTime,
        durationMin: input.durationMin,
        name,
        classType: input.classType?.trim() || null,
        description: input.description?.trim() || null,
        image: input.image?.trim() || null,
        links: cleanLinks(input.links),
        isPublic: true,
      });
    }
  }
  if (!rows.length) return { ok: false, error: "Those already run at this studio." };
  await db.insert(schema.classes).values(rows);
  await catalogue(db, studioId, ctx.userId, input);
  if (coachUserId) {
    await tellCoach(coachUserId, studio.name, name, whenOf(input), true);
    // Once per slot actually made, not once per day: the overlap notice is
    // keyed on its own body, so a class at two times is two real things to
    // hear about and the same time twice is one.
    for (const r of rows)
      await tellAboutDuplicate(db, coachUserId, studio, {
        name,
        dayOfWeek: r.dayOfWeek,
        startTime: r.startTime,
      });
  }
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  // What was made, not what was asked for: the sheet says "15 added" and the
  // grid may have skipped slots that already ran.
  return { ok: true, count: rows.length };
}

/**
 * Freeze what was true before the standing rota changed.
 *
 * `classes.coachUserId` says who teaches a slot now. Read on its own it also
 * claims to say who taught it every week since it existed, which is a lie the
 * moment the assignment changes, and a wrong paycheck if anyone counts from
 * it. So when the standing coach moves, every date that has already run gets
 * an explicit cover recording who was actually on it. Dates with a cover
 * already are left alone: they were exceptions and they still are.
 *
 * The old coach may be null, and that is worth writing too: without it,
 * putting somebody on a slot today would credit them with every week the slot
 * ran open.
 */
async function freezePast(
  db: Awaited<ReturnType<typeof getDb>>,
  cls: typeof schema.classes.$inferSelect,
  wasCoachUserId: string | null,
  byUserId: string,
) {
  const today = todayIso();
  // Since the class existed, and no further back than a year: nobody
  // recalculates payroll from before that, and it keeps one dropdown change
  // from writing hundreds of rows.
  const yearAgo = new Date(`${today}T00:00:00Z`);
  yearAgo.setUTCDate(yearAgo.getUTCDate() - 366);
  const createdIso = cls.createdAt
    ? new Date(cls.createdAt).toISOString().slice(0, 10)
    : today;
  let cursor = createdIso > yearAgo.toISOString().slice(0, 10)
    ? createdIso
    : yearAgo.toISOString().slice(0, 10);

  const had = await db
    .select({ occurrenceDate: schema.shiftCovers.occurrenceDate })
    .from(schema.shiftCovers)
    .where(eq(schema.shiftCovers.classId, cls.id));
  const already = new Set(had.map((h) => h.occurrenceDate));

  const rows: { classId: string; occurrenceDate: string; coachUserId: string | null; createdByUserId: string }[] = [];
  const d = new Date(`${cursor}T00:00:00Z`);
  while (cursor < today) {
    const dow = (d.getUTCDay() + 6) % 7;
    if (runsOn(cls, cursor, dow) && !already.has(cursor))
      rows.push({ classId: cls.id, occurrenceDate: cursor, coachUserId: wasCoachUserId, createdByUserId: byUserId });
    d.setUTCDate(d.getUTCDate() + 1);
    cursor = d.toISOString().slice(0, 10);
  }
  if (rows.length) await db.insert(schema.shiftCovers).values(rows).onConflictDoNothing();
}

export async function updateGymClass(
  studioId: string,
  classId: string,
  input: GymClassInput,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await actingFor(studioId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const bad = validate(input);
  if (bad) return { ok: false, error: bad };
  const { db, studio, gymId } = ctx;

  // Scoped to this gym's own rows: a manager may not reach a coach's personal
  // class, or another studio's, by passing its id.
  const [existing] = await db
    .select()
    .from(schema.classes)
    .where(and(eq(schema.classes.id, classId), eq(schema.classes.userId, gymId)));
  if (!existing) return { ok: false, error: "Class not found." };

  const coachUserId = input.coachUserId || null;
  const name = input.name.trim();
  // One row is one slot, so an edit is about the slot that was opened: the day
  // pills move it rather than fanning it out. Adding a second day is adding a
  // second slot, which the rota does from the day it belongs to.
  const { oneOff, days, endsOn } = shape(input);
  const dayOfWeek = days[0];

  // Before the standing rota moves, write down what it used to be, so the
  // weeks that have already happened keep saying who taught them.
  if (existing.coachUserId !== coachUserId)
    await freezePast(db, existing, existing.coachUserId, ctx.userId);
  // Updated in place, never deleted and reinserted, so any Going mark on this
  // class survives the manager moving it half an hour.
  const [updated] = await db
    .update(schema.classes)
    .set({
      coachUserId,
      dayOfWeek,
      specificDate: oneOff,
      endsOn,
      startTime: input.startTime,
      durationMin: input.durationMin,
      name,
      classType: input.classType?.trim() || null,
      description: input.description?.trim() || null,
      image: input.image?.trim() || null,
      links: cleanLinks(input.links),
    })
    .where(eq(schema.classes.id, classId))
    .returning();
  await catalogue(db, studioId, ctx.userId, input);

  // A cover is an exception to a date this class runs. Move the slot to another
  // day and some of them point at dates it no longer does, where they mean
  // nothing and would come back to life if it ever moved back. Only the ones
  // still ahead go: the past is what freezePast just spent its time recording.
  if (updated) {
    const today = todayIso();
    const covers = await db
      .select()
      .from(schema.shiftCovers)
      .where(eq(schema.shiftCovers.classId, classId));
    const stale = covers.filter(
      (c) =>
        c.occurrenceDate >= today &&
        !runsOn(updated, c.occurrenceDate, dowOfDate(c.occurrenceDate)),
    );
    if (stale.length)
      await db.delete(schema.shiftCovers).where(
        inArray(
          schema.shiftCovers.id,
          stale.map((s) => s.id),
        ),
      );
  }

  // Only the people whose shift actually changed hear about it.
  if (existing.coachUserId !== coachUserId) {
    if (existing.coachUserId)
      await tellCoach(existing.coachUserId, studio.name, existing.name, whenOfRow(existing), false);
    if (coachUserId) await tellCoach(coachUserId, studio.name, name, whenOf(input), true);
  }
  if (coachUserId)
    await tellAboutDuplicate(db, coachUserId, studio, { name, dayOfWeek, startTime: input.startTime });
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  return { ok: true };
}

/**
 * Take a slot off the week, or take one date out of it.
 *
 * "occurrence" is the week off: the slot keeps running and this one date is
 * stamped out of it, which is what a gym means by closing on a holiday. "one"
 * is the slot itself, gone.
 */
export async function deleteGymClass(
  studioId: string,
  classId: string,
  scope: "occurrence" | "one" = "one",
  occurrenceDate?: string | null,
): Promise<{ ok: boolean; error?: string; count?: number }> {
  const ctx = await actingFor(studioId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { db, studio, gymId } = ctx;
  const [existing] = await db
    .select()
    .from(schema.classes)
    .where(and(eq(schema.classes.id, classId), eq(schema.classes.userId, gymId)));
  if (!existing) return { ok: false, error: "Class not found." };
  const today = todayIso();

  // Whoever said they were coming has to be cleared: a Going mark points at
  // this row, so a delete fails on the foreign key while any survive. They are
  // told either way, the same as when a coach cancels one of their own.
  const tellComers = async (when: string, on?: string) => {
    const where = on
      ? and(eq(schema.attendances.classId, classId), eq(schema.attendances.occurrenceDate, on))
      : eq(schema.attendances.classId, classId);
    const marks = await db
      .select({ userId: schema.attendances.userId, date: schema.attendances.occurrenceDate })
      .from(schema.attendances)
      .where(where);
    await db.delete(schema.attendances).where(where);
    // Nobody needs telling that last Tuesday is off.
    const ahead = [...new Set(marks.filter((m) => m.date >= today).map((m) => m.userId))];
    for (const m of ahead) {
      await addNotification(m, {
        type: "class_cancelled",
        title: `${existing.name} is off`,
        body: `${when} at ${studio.name} is no longer on the schedule.`,
        href: "/week",
      });
    }
  };

  // One date off a standing slot. A one-off has only the one occurrence, so
  // cancelling it is just deleting it, and falls through.
  if (scope === "occurrence" && !existing.specificDate) {
    const iso = occurrenceDate?.trim() ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { ok: false, error: "Which date?" };
    if (!existing.skipDates.includes(iso)) {
      await db
        .update(schema.classes)
        .set({ skipDates: [...existing.skipDates, iso].sort() })
        .where(eq(schema.classes.id, classId));
      // Whoever was on that date is off it, and hears so. Read the cover first:
      // a swap means the person on it isn't the standing coach.
      const [cover] = await db
        .select()
        .from(schema.shiftCovers)
        .where(
          and(
            eq(schema.shiftCovers.classId, classId),
            eq(schema.shiftCovers.occurrenceDate, iso),
          ),
        );
      const wasOn = cover ? cover.coachUserId : existing.coachUserId;
      if (cover) await db.delete(schema.shiftCovers).where(eq(schema.shiftCovers.id, cover.id));
      const when = `${fmtDateLong(iso)}, ${fmtTime(existing.startTime)}`;
      await tellComers(when, iso);
      if (wasOn && iso >= today)
        await tellCoach(wasOn, studio.name, existing.name, when, false);
    }
    revalidatePath(`/s/${studio.slug ?? studio.id}`);
    return { ok: true, count: 1 };
  }

  await tellComers(whenOfRow(existing));
  // Its exceptions go with it, or the foreign key refuses the delete.
  await db.delete(schema.shiftCovers).where(eq(schema.shiftCovers.classId, classId));
  await db.delete(schema.classes).where(eq(schema.classes.id, classId));
  if (existing.coachUserId)
    await tellCoach(existing.coachUserId, studio.name, existing.name, whenOfRow(existing), false);
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  return { ok: true, count: 1 };
}

/**
 * Who is on this class on this one date. The swap, and the way a slot is
 * opened up: pass null and nobody is on it, which is a thing a manager says
 * out loud rather than a gap in a spreadsheet.
 *
 * Setting the date back to whoever normally teaches it clears the exception
 * rather than storing a no-op, so the table only ever holds real ones.
 */
export async function setShiftCover(
  studioId: string,
  classId: string,
  occurrenceDate: string,
  coachUserId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await actingFor(studioId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) return { ok: false, error: "Bad date." };
  const { db, userId, studio, gymId } = ctx;

  const [cls] = await db
    .select()
    .from(schema.classes)
    .where(and(eq(schema.classes.id, classId), eq(schema.classes.userId, gymId)));
  if (!cls) return { ok: false, error: "Class not found." };
  const dow = (new Date(`${occurrenceDate}T00:00:00Z`).getUTCDay() + 6) % 7;
  if (!runsOn(cls, occurrenceDate, dow))
    return { ok: false, error: "That class doesn't run that day." };

  const [existing] = await db
    .select()
    .from(schema.shiftCovers)
    .where(
      and(
        eq(schema.shiftCovers.classId, classId),
        eq(schema.shiftCovers.occurrenceDate, occurrenceDate),
      ),
    );
  const before = existing ? existing.coachUserId : cls.coachUserId;
  if (before === coachUserId) return { ok: true };

  if (coachUserId === cls.coachUserId) {
    // Back to normal: the exception stops existing.
    if (existing) await db.delete(schema.shiftCovers).where(eq(schema.shiftCovers.id, existing.id));
  } else if (existing) {
    await db
      .update(schema.shiftCovers)
      .set({ coachUserId, createdByUserId: userId })
      .where(eq(schema.shiftCovers.id, existing.id));
  } else {
    await db
      .insert(schema.shiftCovers)
      .values({ classId, occurrenceDate, coachUserId, createdByUserId: userId });
  }

  // Both sides of a swap hear about it, and only about their own half. The
  // date is the whole point, so it leads.
  const when = `${fmtDateLong(occurrenceDate)}, ${fmtTime(cls.startTime)}`;
  if (before)
    await addNotification(before, {
      type: "shift_dropped",
      title: `You're off ${cls.name}`,
      body: `${when} at ${studio.name}. Somebody else is on it.`,
      href: "/week",
    });
  if (coachUserId)
    await addNotification(coachUserId, {
      type: "shift_assigned",
      title: `You're covering ${cls.name}`,
      body: `${when} at ${studio.name}.`,
      href: "/week",
    });
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  return { ok: true };
}

/**
 * Who can take a slot here: the coaches who teach at this studio.
 *
 * The same union `gymCoaches` uses, without the manager check, because this
 * answers a question about the caller rather than listing anybody.
 */
async function coachesHere(
  db: Awaited<ReturnType<typeof getDb>>,
  studioId: string,
): Promise<Set<string>> {
  const [picked, classRows] = await Promise.all([
    db
      .select({ userId: schema.coachStudios.userId })
      .from(schema.coachStudios)
      .where(eq(schema.coachStudios.studioId, studioId)),
    db
      .select({ userId: schema.classes.userId })
      .from(schema.classes)
      .where(eq(schema.classes.studioId, studioId)),
  ]);
  return new Set([...picked, ...classRows].map((r) => r.userId));
}

/** Everyone who should hear that a slot changed hands without a manager doing
 *  it: the people who run the place, and the coaches who could take it. */
async function tellTheGym(
  db: Awaited<ReturnType<typeof getDb>>,
  studio: typeof schema.studios.$inferSelect,
  exclude: string[],
  n: Parameters<typeof addNotification>[1],
  toCoaches: boolean,
) {
  const managers = await db
    .select({ userId: schema.studioManagers.userId })
    .from(schema.studioManagers)
    .where(eq(schema.studioManagers.studioId, studio.id));
  const ids = new Set(managers.map((m) => m.userId));
  if (toCoaches) for (const id of await coachesHere(db, studio.id)) ids.add(id);
  for (const id of exclude) ids.delete(id);
  for (const id of ids) await addNotification(id, n);
}

/**
 * The coach's own half of the rota: give up a date, or take an open one.
 *
 * A manager moving somebody is `setShiftCover`. This is the coach doing it
 * themselves, which is the thing fifteen people at a gym actually want and the
 * reason the rota is worth more than the spreadsheet: today "I can't make
 * Thursday" is a text message somebody loses. Giving a date up opens the slot
 * and says so out loud, to the managers and to everyone who could cover it.
 * It is a notice, not a request: nobody is asked for permission, and nobody
 * finds out too late.
 */
async function shiftFor(classId: string, occurrenceDate: string) {
  const userId = await getSessionUserId();
  if (!userId) return { error: "Session expired." as const };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) return { error: "Bad date." as const };
  const db = await getDb();
  const [cls] = await db.select().from(schema.classes).where(eq(schema.classes.id, classId));
  if (!cls?.studioId) return { error: "Class not found." as const };
  const [owner] = await db.select().from(schema.users).where(eq(schema.users.id, cls.userId));
  // Only a gym's own rota has shifts to hand around. A coach's own class is
  // theirs to edit and has nobody else on it.
  if (owner?.kind !== "gym") return { error: "Class not found." as const };
  const dow = dowOfDate(occurrenceDate);
  if (!runsOn(cls, occurrenceDate, dow))
    return { error: "That class doesn't run that day." as const };
  if (occurrenceDate < todayIso()) return { error: "That date has already gone." as const };
  const [studio] = await db
    .select()
    .from(schema.studios)
    .where(eq(schema.studios.id, cls.studioId));
  if (!studio) return { error: "Class not found." as const };
  const [cover] = await db
    .select()
    .from(schema.shiftCovers)
    .where(
      and(
        eq(schema.shiftCovers.classId, classId),
        eq(schema.shiftCovers.occurrenceDate, occurrenceDate),
      ),
    );
  const on = cover ? cover.coachUserId : cls.coachUserId;
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  return { db, userId, me, cls, studio, cover, on };
}

/** Put a date back into the pool. The slot still runs; nobody is on it. */
export async function giveUpShift(
  classId: string,
  occurrenceDate: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await shiftFor(classId, occurrenceDate);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { db, userId, me, cls, studio, cover, on } = ctx;
  if (on !== userId) return { ok: false, error: "You aren't on that one." };

  if (cover) {
    await db
      .update(schema.shiftCovers)
      .set({ coachUserId: null, createdByUserId: userId })
      .where(eq(schema.shiftCovers.id, cover.id));
  } else {
    await db
      .insert(schema.shiftCovers)
      .values({ classId, occurrenceDate, coachUserId: null, createdByUserId: userId });
  }

  const when = `${fmtDateLong(occurrenceDate)}, ${fmtTime(cls.startTime)}`;
  const who = me?.name?.trim() || "A coach";
  await tellTheGym(
    db,
    studio,
    [userId],
    {
      type: "shift_dropped",
      title: `${cls.name} needs somebody`,
      body: `${who} is off ${when} at ${studio.name}. The slot is open.`,
      href: `/s/${studio.slug ?? studio.id}/${cls.id}?d=${occurrenceDate}`,
      actorUserId: userId,
    },
    true,
  );
  revalidatePath("/app");
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  return { ok: true };
}

/** Take a date nobody is on. Only coaches who teach at this studio. */
export async function claimShift(
  classId: string,
  occurrenceDate: string,
): Promise<{ ok: boolean; error?: string; pending?: boolean }> {
  const ctx = await shiftFor(classId, occurrenceDate);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { db, userId, me, cls, studio, cover, on } = ctx;
  if (on) return { ok: false, error: "Somebody is already on that one." };
  if (me?.kind === "fan") return { ok: false, error: "That's for coaches at this studio." };
  if (!(await coachesHere(db, studio.id)).has(userId))
    return { ok: false, error: "That's for coaches at this studio." };

  // Taking back a date you gave up yourself is not a change to anybody, so it
  // never waits: the slot returns to the person the class already names.
  if (userId !== cls.coachUserId) {
    const filed = await fileRequest(db, {
      studio,
      cls,
      occurrenceDate,
      kind: "pickup",
      fromUserId: cover?.coachUserId ?? cls.coachUserId ?? null,
      toUserId: userId,
      askedBy: userId,
      askerName: me?.name?.trim() || "A coach",
      toName: me?.name?.trim() || "A coach",
    });
    // `pending` is what stops a screen saying "it's yours" about something
    // the studio has not agreed to.
    if (filed.filed)
      return filed.error ? { ok: false, error: filed.error } : { ok: true, pending: true };
  }

  if (userId === cls.coachUserId) {
    // Taking back a date they'd given up: the exception stops existing.
    if (cover) await db.delete(schema.shiftCovers).where(eq(schema.shiftCovers.id, cover.id));
  } else if (cover) {
    await db
      .update(schema.shiftCovers)
      .set({ coachUserId: userId, createdByUserId: userId })
      .where(eq(schema.shiftCovers.id, cover.id));
  } else {
    await db
      .insert(schema.shiftCovers)
      .values({ classId, occurrenceDate, coachUserId: userId, createdByUserId: userId });
  }

  const when = `${fmtDateLong(occurrenceDate)}, ${fmtTime(cls.startTime)}`;
  const who = me?.name?.trim() || "A coach";
  // Managers only. Everyone else was told it was open so that one of them
  // would take it, and telling them all again that it's handled is noise.
  await tellTheGym(
    db,
    studio,
    [userId],
    {
      type: "shift_assigned",
      title: `${who} took ${cls.name}`,
      body: `${when} at ${studio.name}.`,
      href: `/s/${studio.slug ?? studio.id}/${cls.id}?d=${occurrenceDate}`,
      actorUserId: userId,
    },
    false,
  );
  revalidatePath("/app");
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  return { ok: true };
}

/**
 * Hand a date straight to a named coach.
 *
 * Giving up opens the slot and hopes; this is the other thing that actually
 * happens at a gym, where the swap was agreed over the counter and just needs
 * writing down. Only the coach on the date can hand it on, and only to
 * somebody on the gym's shift list: anyone may say they coach here, and the
 * list is the gym saying who really takes these classes. Like the rest of the
 * rota it is a notice, not a request: the swap was already agreed, and the
 * managers hear about it rather than sitting in the middle of it.
 */
export async function sendShiftTo(
  classId: string,
  occurrenceDate: string,
  toUserId: string,
): Promise<{ ok: boolean; error?: string; pending?: boolean }> {
  const ctx = await shiftFor(classId, occurrenceDate);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { db, userId, me, cls, studio, cover, on } = ctx;
  if (on !== userId) return { ok: false, error: "You aren't on that one." };
  if (toUserId === userId) return { ok: false, error: "That's already you." };
  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, toUserId));
  if (!target || target.kind === "fan" || target.kind === "gym")
    return { ok: false, error: "That's not a coach here." };
  const [listed] = await db
    .select({ id: schema.studioRotaCoaches.id })
    .from(schema.studioRotaCoaches)
    .where(
      and(
        eq(schema.studioRotaCoaches.studioId, studio.id),
        eq(schema.studioRotaCoaches.userId, toUserId),
      ),
    );
  if (!listed) return { ok: false, error: "They aren't on this gym's shift list." };

  // Handing a date back to whoever normally teaches it is putting the rota
  // back the way it was, so there is nothing for a manager to weigh.
  if (toUserId !== cls.coachUserId) {
    const filed = await fileRequest(db, {
      studio,
      cls,
      occurrenceDate,
      kind: "transfer",
      fromUserId: userId,
      toUserId,
      askedBy: userId,
      askerName: me?.name?.trim() || "A coach",
      toName: target.name.trim() || target.email.split("@")[0],
    });
    if (filed.filed) {
      if (filed.error) return { ok: false, error: filed.error };
      // The named coach hears that they have been asked for, not that it is
      // theirs: it is not, until the studio says so.
      await addNotification(toUserId, {
        type: "shift_request",
        title: `You've been asked to cover ${cls.name}`,
        body: `${fmtDateLong(occurrenceDate)}, ${fmtTime(cls.startTime)} at ${studio.name}. Waiting on the studio.`,
        href: `/s/${studio.slug ?? studio.id}/${cls.id}?d=${occurrenceDate}`,
        actorUserId: userId,
      });
      return { ok: true, pending: true };
    }
  }

  if (toUserId === cls.coachUserId) {
    // Handing it back to whoever normally teaches it: the exception stops
    // existing rather than being restated.
    if (cover) await db.delete(schema.shiftCovers).where(eq(schema.shiftCovers.id, cover.id));
  } else if (cover) {
    await db
      .update(schema.shiftCovers)
      .set({ coachUserId: toUserId, createdByUserId: userId })
      .where(eq(schema.shiftCovers.id, cover.id));
  } else {
    await db
      .insert(schema.shiftCovers)
      .values({ classId, occurrenceDate, coachUserId: toUserId, createdByUserId: userId });
  }

  const when = `${fmtDateLong(occurrenceDate)}, ${fmtTime(cls.startTime)}`;
  const who = me?.name?.trim() || "A coach";
  const toName = target.name.trim() || target.email.split("@")[0];
  await addNotification(toUserId, {
    type: "shift_assigned",
    title: `You're covering ${cls.name}`,
    body: `${when} at ${studio.name}. ${who} handed it to you.`,
    href: `/s/${studio.slug ?? studio.id}/${cls.id}?d=${occurrenceDate}`,
    actorUserId: userId,
  });
  // Managers only: the two coaches sorted it out, and this is the receipt.
  await tellTheGym(
    db,
    studio,
    [userId, toUserId],
    {
      type: "shift_assigned",
      title: `${who} handed ${cls.name} to ${toName}`,
      body: `${when} at ${studio.name}.`,
      href: `/s/${studio.slug ?? studio.id}/${cls.id}?d=${occurrenceDate}`,
      actorUserId: userId,
    },
    false,
  );
  revalidatePath("/app");
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  return { ok: true };
}

/**
 * Hand a coach's own copy of a class over to the gym that now runs it.
 *
 * Every coach at a gym listed their classes here before the gym had a page, so
 * the day it signs up each of them is holding a duplicate. Public surfaces
 * already show the gym's row and hide theirs, so nobody sees it twice; this is
 * the cleanup, and it is the coach's to do because it is their row.
 *
 * Deleting it outright would be wrong twice over: whoever saved it would be
 * told their class was cancelled when it plainly wasn't, and they would lose
 * their spot. The marks move to the gym's row first, so a member who said they
 * were coming still is.
 */
export async function mergeIntoGym(
  classId: string,
): Promise<{ ok: boolean; error?: string; moved?: number }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const db = await getDb();
  const [mine] = await db
    .select()
    .from(schema.classes)
    .where(and(eq(schema.classes.id, classId), eq(schema.classes.userId, userId)));
  if (!mine?.studioId) return { ok: false, error: "Class not found." };

  // The gym's row for the same slot: same place, same day, same time, same
  // name. Anything looser pairs the yoga room's six o'clock with the spin
  // room's, and a wrong pair takes a real class off somebody's page.
  const atStudio = await db
    .select()
    .from(schema.classes)
    .where(
      and(
        eq(schema.classes.studioId, mine.studioId),
        eq(schema.classes.dayOfWeek, mine.dayOfWeek),
        eq(schema.classes.startTime, mine.startTime),
      ),
    );
  const owners = await db
    .select({ id: schema.users.id, kind: schema.users.kind })
    .from(schema.users)
    .where(inArray(schema.users.id, [...new Set(atStudio.map((c) => c.userId))]));
  const gyms = new Set(owners.filter((o) => o.kind === "gym").map((o) => o.id));
  const key = mine.name.trim().toLowerCase();
  const theirs = atStudio.find(
    (c) => gyms.has(c.userId) && c.name.trim().toLowerCase() === key,
  );
  if (!theirs) return { ok: false, error: "No gym runs this one." };

  // Only what is still ahead. A mark on a class that already ran is a record
  // of turning up, and it belongs where it was made.
  const today = todayIso();
  const marks = await db
    .select()
    .from(schema.attendances)
    .where(eq(schema.attendances.classId, classId));
  const ahead = marks.filter((m) => m.occurrenceDate >= today);
  if (ahead.length)
    await db
      .insert(schema.attendances)
      .values(
        ahead.map((m) => ({
          userId: m.userId,
          classId: theirs.id,
          occurrenceDate: m.occurrenceDate,
        })),
      )
      .onConflictDoNothing({
        target: [
          schema.attendances.userId,
          schema.attendances.classId,
          schema.attendances.occurrenceDate,
        ],
      });
  await db.delete(schema.attendances).where(eq(schema.attendances.classId, classId));
  await db.delete(schema.classes).where(eq(schema.classes.id, classId));

  revalidatePath("/app");
  revalidatePath("/feed");
  return { ok: true, moved: ahead.length };
}

/** Tell a coach their own listing has been taken over, so the duplicate on
 *  their schedule isn't a mystery. Once per slot: reassigning the same class
 *  a second time shouldn't nag them again. */
async function tellAboutDuplicate(
  db: Awaited<ReturnType<typeof getDb>>,
  coachUserId: string,
  studio: typeof schema.studios.$inferSelect,
  row: { name: string; dayOfWeek: number; startTime: string },
) {
  const key = row.name.trim().toLowerCase();
  const theirs = (
    await db
      .select()
      .from(schema.classes)
      .where(
        and(
          eq(schema.classes.userId, coachUserId),
          eq(schema.classes.studioId, studio.id),
          eq(schema.classes.dayOfWeek, row.dayOfWeek),
          eq(schema.classes.startTime, row.startTime),
        ),
      )
  ).filter((c) => c.name.trim().toLowerCase() === key);
  if (!theirs.length) return;
  const body = `${studio.name} runs ${row.name} on ${DAYS[row.dayOfWeek]} at ${fmtTime(row.startTime)} now. Your own copy is hidden so nobody sees it twice. Hand it over on your schedule and anyone who added yours keeps their spot.`;
  const [already] = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.userId, coachUserId),
        eq(schema.notifications.type, "class_overlap"),
        eq(schema.notifications.body, body),
      ),
    );
  if (already) return;
  await addNotification(coachUserId, {
    type: "class_overlap",
    title: `${studio.name} lists ${row.name} too`,
    body,
    href: "/app",
  });
}

export type GymCountRow = {
  coachUserId: string;
  name: string;
  first: number;
  second: number;
  total: number;
};
export type GymCounts = {
  /** The month being counted, as "2026-08", and how it reads. */
  month: string;
  label: string;
  /** The two halves, so it lines up with a semi-monthly pay run. */
  firstLabel: string;
  secondLabel: string;
  rows: GymCountRow[];
  /** Dates in the month with a class nobody was on. Not somebody's pay, but
   *  the manager's problem, and counting is when it surfaces. */
  openSlots: number;
};

/**
 * How many classes each coach was on, in a month, split into halves.
 *
 * Counted from the schedule rather than tallied by hand: every date the class
 * runs (runsOn, the same predicate every other surface uses) with any cover
 * for that date laid over the top. A number derived from the rota can't drift
 * from it the way a COUNTIF over a grid does.
 *
 * This is a count and an export, not payroll. It models no rates, no periods
 * and no overtime, and produces nothing that is itself a pay record: the
 * number goes to whoever actually pays people. Every coach can see their own,
 * which is what makes fifteen people the check on it.
 */
export async function gymCounts(studioId: string, monthIso?: string): Promise<GymCounts | null> {
  const ctx = await actingFor(studioId);
  if ("error" in ctx) return null;
  const { db, gymId } = ctx;

  const month = /^\d{4}-\d{2}$/.test(monthIso ?? "") ? monthIso! : todayIso().slice(0, 7);
  const [y, mo] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const iso = (d: number) => `${month}-${String(d).padStart(2, "0")}`;

  const rows = await db
    .select()
    .from(schema.classes)
    .where(and(eq(schema.classes.userId, gymId), eq(schema.classes.studioId, studioId)));
  const covers = rows.length
    ? await db
        .select()
        .from(schema.shiftCovers)
        .where(inArray(schema.shiftCovers.classId, rows.map((r) => r.id)))
    : [];
  const coverBy = new Map(covers.map((c) => [`${c.classId}|${c.occurrenceDate}`, c]));

  // runsOn describes a standing weekly slot, which has no notion of when the
  // gym started running it: left alone it happily reports that a class added
  // today also ran every Thursday last year. A slot only counts from the day
  // it existed.
  const startedOn = new Map(
    rows.map((r) => [
      r.id,
      r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : "0000-00-00",
    ]),
  );

  const tally = new Map<string, { first: number; second: number }>();
  let openSlots = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = iso(d);
    const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
    for (const r of rows) {
      if (date < (startedOn.get(r.id) ?? "")) continue;
      if (!runsOn(r, date, dow)) continue;
      const cover = coverBy.get(`${r.id}|${date}`);
      const who = cover ? cover.coachUserId : r.coachUserId;
      if (!who) {
        openSlots++;
        continue;
      }
      const cur = tally.get(who) ?? { first: 0, second: 0 };
      if (d <= 15) cur.first++;
      else cur.second++;
      tally.set(who, cur);
    }
  }

  const ids = [...tally.keys()];
  const people = ids.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, ids))
    : [];
  const nameOf = new Map(
    people.map((p) => [p.id, p.name.trim() || p.email.split("@")[0]] as const),
  );
  // 31st, not 31th.
  const ordinal = (n: number) => {
    const rem100 = n % 100;
    if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
    return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
  };
  const monthName = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return {
    month,
    label: monthName,
    firstLabel: "1st to 15th",
    secondLabel: `16th to ${ordinal(daysInMonth)}`,
    openSlots,
    rows: ids
      .map((id) => {
        const t = tally.get(id)!;
        return {
          coachUserId: id,
          name: nameOf.get(id) ?? "",
          first: t.first,
          second: t.second,
          total: t.first + t.second,
        };
      })
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
  };
}

// ---------------------------------------------------------------------------
// The staff screen: who runs the page, and who takes the classes.
//
// Two different claims, which is why they are two lists rather than one. A
// manager holds the keys to the page; a coach on the shift list takes the
// classes on the rota. The same person is often both and neither implies the
// other: an owner who never teaches runs the page, and a coach who teaches
// every morning has no business editing the address.
// ---------------------------------------------------------------------------

/** May this caller run the place? Unlike `actingFor` this does not require the
 *  gym account: a studio is claimed the moment it has a manager, and staff is
 *  exactly what you set up before you turn a schedule on. */
async function managing(studioId: string) {
  const userId = await getSessionUserId();
  if (!userId) return { error: "Session expired." as const };
  const db = await getDb();
  const [me] = await db
    .select({ kind: schema.users.kind })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me) return { error: "Session expired." as const };
  const [studio] = await db.select().from(schema.studios).where(eq(schema.studios.id, studioId));
  if (!studio) return { error: "Studio not found." as const };
  const access = await studioAccess(studioId, { id: userId, kind: me.kind });
  if (!access.isManager)
    return { error: "Only the people who run this studio can do that." as const };
  return { db, userId, studio };
}

export type StaffPerson = {
  id: string;
  name: string;
  email: string;
  /** They added themselves nothing: this is the viewer, so the row says so
   *  and removing it warns rather than just doing it. */
  isYou: boolean;
};
export type StudioStaffDto = {
  managers: StaffPerson[];
  /** Empty until the studio runs a schedule: a shift list with no rota to be
   *  on is a question nobody asked. */
  pool: RotaPoolDto[];
  hasSchedule: boolean;
};

/** Both lists at once: the screen shows them together. */
export async function studioStaff(studioId: string): Promise<StudioStaffDto | null> {
  const ctx = await managing(studioId);
  if ("error" in ctx) return null;
  const { db, userId, studio } = ctx;
  const rows = await db
    .select({ userId: schema.studioManagers.userId })
    .from(schema.studioManagers)
    .where(eq(schema.studioManagers.studioId, studioId));
  const ids = rows.map((r) => r.userId);
  const people = ids.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, ids))
    : [];
  const managers = people
    .map((p) => ({
      id: p.id,
      name: p.name.trim() || p.email.split("@")[0],
      email: p.email,
      isYou: p.id === userId,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  // The shift list needs the rota it feeds, so it waits for the account.
  const pool = studio.accountUserId ? await rotaPool(studioId) : [];
  return { managers, pool, hasSchedule: !!studio.accountUserId };
}

/**
 * Hand a second set of keys out, without going through us.
 *
 * This was an admin-only action, which meant a gym that wanted its own manager
 * on the page had to ask fittlist for it. A place of work has more than one
 * person running it and that is the whole reason `studio_managers` is a join
 * table rather than a column, so the people who already hold the keys are the
 * right ones to hand them on.
 */
export async function addStudioManager(
  studioId: string,
  emailRaw: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await managing(studioId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { db, userId, studio } = ctx;
  const email = emailRaw.trim().toLowerCase();
  if (!email) return { ok: false, error: "Enter their email." };
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  // Deliberately the same words the admin's version uses: an invite flow for
  // somebody with no account is its own feature, not a fallback hidden here.
  if (!user) return { ok: false, error: "Nobody with that email has an account yet." };
  if (user.kind === "gym")
    return { ok: false, error: "That's the studio's own account, not a person." };
  const already = await db
    .select({ id: schema.studioManagers.id })
    .from(schema.studioManagers)
    .where(
      and(eq(schema.studioManagers.studioId, studioId), eq(schema.studioManagers.userId, user.id)),
    );
  if (already.length) return { ok: false, error: "They already run this page." };
  await db
    .insert(schema.studioManagers)
    .values({ studioId, userId: user.id, addedByUserId: userId });
  await addNotification(user.id, {
    type: "studio_manager",
    title: `You run ${studio.name} on fittlist`,
    body: "You can edit its page, and its details are yours to state.",
    href: `/s/${studio.slug ?? studio.id}`,
  });
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  revalidatePath(`/s/${studio.slug ?? studio.id}/manage/staff`);
  return { ok: true };
}

/**
 * Take a set of keys back, including your own.
 *
 * The last one may not leave from here. An empty list returns the page to the
 * commons, which is a real thing that happens and much too big to do by
 * mistyping a tap on a phone; `currentAdmin()` still has the unguarded version
 * for a gym that genuinely wants out. This is the same reason studioAccess
 * keeps an admin door at all: somebody has to be able to fix a place that has
 * locked itself out.
 */
export async function removeStudioManager(
  studioId: string,
  targetId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await managing(studioId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { db, studio } = ctx;
  const rows = await db
    .select({ userId: schema.studioManagers.userId })
    .from(schema.studioManagers)
    .where(eq(schema.studioManagers.studioId, studioId));
  if (rows.length <= 1)
    return {
      ok: false,
      error: "Somebody has to run the page. Add another manager before you leave.",
    };
  await db
    .delete(schema.studioManagers)
    .where(
      and(eq(schema.studioManagers.studioId, studioId), eq(schema.studioManagers.userId, targetId)),
    );
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  revalidatePath(`/s/${studio.slug ?? studio.id}/manage/staff`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Shift changes that wait on a manager.
//
// Per the staff spec, `studios.approveShiftChanges` is on by default: picking
// up an open shift and being handed one both become asks rather than facts.
// This reverses what the rota did before, which was deliberate at the time
// ("a notice, not a request: nobody asks permission, and nobody finds out too
// late") and is now the studio's own switch. With it off, everything below
// falls straight through to the immediate write and the old behaviour stands.
//
// The one rule that makes this safe: a pending change never touches
// `shift_covers`. Until a manager answers, no public page, no feed, no .ics
// and no coach's own calendar says anything has moved, because the only table
// that would tell them has not been written.
// ---------------------------------------------------------------------------

export type ShiftRequestDto = {
  id: string;
  kind: "pickup" | "transfer";
  className: string;
  whenLong: string;
  iso: string;
  fromName: string | null;
  toName: string;
  /** The viewer is the one who asked, so the row reads as theirs. */
  mine: boolean;
};

/** Does this studio make a change wait? */
async function needsApproval(db: Awaited<ReturnType<typeof getDb>>, studioId: string) {
  const [s] = await db
    .select({ on: schema.studios.approveShiftChanges })
    .from(schema.studios)
    .where(eq(schema.studios.id, studioId));
  return !!s?.on;
}

/** File the ask, and tell the managers there is one. Returns false when the
 *  studio takes changes immediately, so the caller does the real write. */
async function fileRequest(
  db: Awaited<ReturnType<typeof getDb>>,
  args: {
    studio: typeof schema.studios.$inferSelect;
    cls: typeof schema.classes.$inferSelect;
    occurrenceDate: string;
    kind: "pickup" | "transfer";
    fromUserId: string | null;
    toUserId: string;
    askedBy: string;
    askerName: string;
    toName: string;
  },
): Promise<{ filed: boolean; error?: string }> {
  if (!(await needsApproval(db, args.studio.id))) return { filed: false };
  const dupe = await db
    .select({ id: schema.shiftRequests.id })
    .from(schema.shiftRequests)
    .where(
      and(
        eq(schema.shiftRequests.classId, args.cls.id),
        eq(schema.shiftRequests.occurrenceDate, args.occurrenceDate),
        eq(schema.shiftRequests.toUserId, args.toUserId),
        eq(schema.shiftRequests.state, "pending"),
      ),
    );
  if (dupe.length) return { filed: true, error: "That's already waiting on the studio." };
  await db.insert(schema.shiftRequests).values({
    studioId: args.studio.id,
    classId: args.cls.id,
    occurrenceDate: args.occurrenceDate,
    kind: args.kind,
    fromUserId: args.fromUserId,
    toUserId: args.toUserId,
  });
  const when = `${fmtDateLong(args.occurrenceDate)}, ${fmtTime(args.cls.startTime)}`;
  await tellTheGym(
    db,
    args.studio,
    [],
    {
      type: "shift_request",
      title:
        args.kind === "pickup"
          ? `${args.askerName} wants ${args.cls.name}`
          : `${args.askerName} is handing ${args.cls.name} to ${args.toName}`,
      body: `${when}. Waiting on you.`,
      href: `/s/${args.studio.slug ?? args.studio.id}/manage/staff`,
      actorUserId: args.askedBy,
    },
    false,
  );
  return { filed: true };
}

/** Everything waiting on this studio, newest first. Managers only. */
export async function shiftRequests(studioId: string): Promise<ShiftRequestDto[]> {
  const ctx = await managing(studioId);
  if ("error" in ctx) return [];
  const { db, userId } = ctx;
  const rows = await db
    .select()
    .from(schema.shiftRequests)
    .where(and(eq(schema.shiftRequests.studioId, studioId), eq(schema.shiftRequests.state, "pending")));
  if (!rows.length) return [];
  const ids = [...new Set(rows.flatMap((r) => [r.toUserId, r.fromUserId].filter(Boolean) as string[]))];
  const people = ids.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, ids))
    : [];
  const nameOf = new Map(people.map((p) => [p.id, p.name.trim() || p.email.split("@")[0]]));
  const clsIds = [...new Set(rows.map((r) => r.classId))];
  const clsRows = await db.select().from(schema.classes).where(inArray(schema.classes.id, clsIds));
  const clsById = new Map(clsRows.map((c) => [c.id, c]));
  return rows
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((r) => {
      const c = clsById.get(r.classId);
      return {
        id: r.id,
        kind: r.kind as "pickup" | "transfer",
        className: c?.name ?? "A class",
        whenLong: c ? `${fmtDateLong(r.occurrenceDate)}, ${fmtTime(c.startTime)}` : fmtDateLong(r.occurrenceDate),
        iso: r.occurrenceDate,
        fromName: r.fromUserId ? (nameOf.get(r.fromUserId) ?? null) : null,
        toName: nameOf.get(r.toUserId) ?? "A coach",
        mine: r.toUserId === userId,
      };
    });
}

/**
 * Say yes or no. Approving is the moment the change becomes true, so it is
 * also the moment the cover is written: everything before this was an ask.
 */
export async function answerShiftRequest(
  requestId: string,
  approve: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const db = await getDb();
  const [req] = await db
    .select()
    .from(schema.shiftRequests)
    .where(eq(schema.shiftRequests.id, requestId));
  if (!req) return { ok: false, error: "That request is gone." };
  const ctx = await managing(req.studioId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { studio } = ctx;
  if (req.state !== "pending") return { ok: false, error: "That one is already answered." };
  const [cls] = await db.select().from(schema.classes).where(eq(schema.classes.id, req.classId));
  if (!cls) return { ok: false, error: "That class is gone." };

  await db
    .update(schema.shiftRequests)
    .set({ state: approve ? "approved" : "declined", decidedByUserId: userId, decidedAt: new Date() })
    .where(eq(schema.shiftRequests.id, requestId));

  if (approve) {
    // Now, and only now, the calendars learn about it.
    const [cover] = await db
      .select()
      .from(schema.shiftCovers)
      .where(
        and(
          eq(schema.shiftCovers.classId, req.classId),
          eq(schema.shiftCovers.occurrenceDate, req.occurrenceDate),
        ),
      );
    if (req.toUserId === cls.coachUserId) {
      if (cover) await db.delete(schema.shiftCovers).where(eq(schema.shiftCovers.id, cover.id));
    } else if (cover) {
      await db
        .update(schema.shiftCovers)
        .set({ coachUserId: req.toUserId, createdByUserId: userId })
        .where(eq(schema.shiftCovers.id, cover.id));
    } else {
      await db.insert(schema.shiftCovers).values({
        classId: req.classId,
        occurrenceDate: req.occurrenceDate,
        coachUserId: req.toUserId,
        createdByUserId: userId,
      });
    }
  }

  const when = `${fmtDateLong(req.occurrenceDate)}, ${fmtTime(cls.startTime)}`;
  // The asker hears either way. A declined ask that says nothing is how
  // somebody turns up to a class that was never theirs.
  await addNotification(req.toUserId, {
    type: approve ? "shift_assigned" : "shift_declined",
    title: approve ? `You're on ${cls.name}` : `${cls.name} stayed where it was`,
    body: approve
      ? `${when} at ${studio.name}. The studio said yes.`
      : `${when} at ${studio.name}. The studio didn't approve the change.`,
    href: `/s/${studio.slug ?? studio.id}/${cls.id}?d=${req.occurrenceDate}`,
    actorUserId: userId,
  });
  // A transfer has somebody on the other end of it who also arranged this.
  if (req.fromUserId && req.fromUserId !== req.toUserId) {
    await addNotification(req.fromUserId, {
      type: approve ? "shift_assigned" : "shift_declined",
      title: approve ? `${cls.name} is covered` : `${cls.name} is still yours`,
      body: approve
        ? `${when} at ${studio.name}. The studio approved the hand-over.`
        : `${when} at ${studio.name}. The studio didn't approve it.`,
      href: `/s/${studio.slug ?? studio.id}/${cls.id}?d=${req.occurrenceDate}`,
      actorUserId: userId,
    });
  }
  revalidatePath("/app");
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  revalidatePath(`/s/${studio.slug ?? studio.id}/manage/staff`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The staff side, for a coach who is not a manager.
//
// Everything above this point answers to `actingFor` or `managing`, both of
// which mean "you run this place". A coach who merely works here had no studio
// screen at all: the rota is the managers' and the studio page is the public
// one. The spec's arrangement is that My shifts is the default tab for
// everyone, admin or not, and the admin's extra powers are extra tabs rather
// than a separate app.
// ---------------------------------------------------------------------------

export type StaffShift = {
  classId: string;
  iso: string;
  name: string;
  timeLabel: string;
  durationMin: number;
  where: string | null;
  /** Nobody is on it. */
  open: boolean;
  /** The viewer is on it. */
  mine: boolean;
  /** Who is on it, for the admin's full view. Null when nobody is. */
  onName: string | null;
  /** A pending ask against this date, said on the row. */
  pending: string | null;
};
export type StaffView = {
  studioName: string;
  slug: string;
  isManager: boolean;
  /** They coach here, whether or not they run the place. */
  isStaff: boolean;
  coachCount: number;
  mine: StaffShift[];
  open: StaffShift[];
  all: StaffShift[];
  requests: ShiftRequestDto[];
  approvalOn: boolean;
  /** Who a shift can be handed to: the gym's own shift list, minus the
   *  viewer. One list for the whole screen rather than one per row, because
   *  it is the same answer for every date at the same studio. Empty leaves
   *  the rows with Give up alone, which is the honest thing when the managers
   *  have named nobody. */
  sendable: Sendable[];
};

/** May this person see a studio's staff side at all? */
async function staffing(studioId: string) {
  const userId = await getSessionUserId();
  if (!userId) return { error: "Session expired." as const };
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return { error: "Session expired." as const };
  const [studio] = await db.select().from(schema.studios).where(eq(schema.studios.id, studioId));
  if (!studio) return { error: "Studio not found." as const };
  const access = await studioAccess(studioId, { id: userId, kind: me.kind });
  // A coach who lists this studio is staff. That is the same union the rota
  // and the studio's Coaches tab already use, so nobody has to be added twice.
  const isStaff = (await coachesHere(db, studioId)).has(userId);
  if (!access.isManager && !isStaff)
    return { error: "That's for the people who work at this studio." as const };
  return { db, userId, me, studio, isManager: access.isManager, isStaff };
}

/**
 * The staff side of one studio, for whoever is looking.
 *
 * A fortnight forward, because a rota is planned about that far ahead and the
 * question this screen answers ("am I on anything, is anything uncovered") has
 * no useful answer beyond it. Today's passed occurrences come off with the
 * same predicate every other surface uses.
 */
export async function staffView(studioId: string): Promise<StaffView | null> {
  const ctx = await staffing(studioId);
  if ("error" in ctx) return null;
  const { db, userId, studio, isManager, isStaff } = ctx;
  // No gym account means no rota to draw, but the screen still has to render:
  // Your studios on the You tab is the only way to run a place now, and 404ing
  // here left a manager whose studio has no schedule yet with no route to the
  // editor at all. Empty lists, and the overflow carries the rest.
  if (!studio.accountUserId)
    return {
      studioName: studio.name,
      slug: studio.slug ?? studio.id,
      isManager,
      isStaff,
      coachCount: (await coachesHere(db, studio.id)).size,
      mine: [],
      open: [],
      all: [],
      requests: [],
      approvalOn: !!studio.approveShiftChanges,
      sendable: [],
    };

  const rows = (
    await db
      .select()
      .from(schema.classes)
      .where(
        and(eq(schema.classes.userId, studio.accountUserId), eq(schema.classes.studioId, studioId)),
      )
  ).filter((c) => c.isPublic);
  const covers = rows.length
    ? await db
        .select()
        .from(schema.shiftCovers)
        .where(inArray(schema.shiftCovers.classId, rows.map((r) => r.id)))
    : [];
  const coverBy = new Map(covers.map((c) => [`${c.classId}|${c.occurrenceDate}`, c]));
  const pending = rows.length
    ? await db
        .select()
        .from(schema.shiftRequests)
        .where(
          and(eq(schema.shiftRequests.studioId, studioId), eq(schema.shiftRequests.state, "pending")),
        )
    : [];
  const ids = new Set<string>();
  for (const r of rows) if (r.coachUserId) ids.add(r.coachUserId);
  for (const c of covers) if (c.coachUserId) ids.add(c.coachUserId);
  for (const p of pending) ids.add(p.toUserId);
  const people = ids.size
    ? await db.select().from(schema.users).where(inArray(schema.users.id, [...ids]))
    : [];
  const nameOf = new Map(people.map((p) => [p.id, p.name.trim() || p.email.split("@")[0]] as const));
  const pendBy = new Map(pending.map((p) => [`${p.classId}|${p.occurrenceDate}`, p]));

  const today = todayIso();
  const start = new Date(`${today}T00:00:00Z`);
  const mine: StaffShift[] = [];
  const open: StaffShift[] = [];
  const all: StaffShift[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dow = (d.getUTCDay() + 6) % 7;
    for (const r of rows
      .filter((c) => runsOn(c, iso, dow))
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))) {
      if (occurrenceEnded(iso, r.startTime, r.durationMin)) continue;
      const cover = coverBy.get(`${r.id}|${iso}`);
      const onUserId = cover ? cover.coachUserId : r.coachUserId;
      const ask = pendBy.get(`${r.id}|${iso}`);
      const item: StaffShift = {
        classId: r.id,
        iso,
        name: r.name,
        timeLabel: `${fmtDayHeader(iso)} · ${fmtTime(r.startTime)}`,
        durationMin: r.durationMin,
        where: r.location,
        open: !onUserId,
        mine: onUserId === userId,
        onName: onUserId ? (nameOf.get(onUserId) ?? null) : null,
        pending: ask
          ? ask.kind === "pickup"
            ? `${nameOf.get(ask.toUserId) ?? "A coach"} asked for this one`
            : `Offered to ${nameOf.get(ask.toUserId) ?? "a coach"}`
          : null,
      };
      if (item.mine) mine.push(item);
      if (item.open) open.push(item);
      all.push(item);
    }
  }
  return {
    studioName: studio.name,
    slug: studio.slug ?? studio.id,
    isManager,
    isStaff,
    coachCount: (await coachesHere(db, studioId)).size,
    mine,
    open,
    all,
    requests: isManager ? await shiftRequests(studioId) : [],
    approvalOn: !!studio.approveShiftChanges,
    // Only when they are on something: a list of names is no use to somebody
    // with nothing to hand over, and this is a query per screen either way.
    sendable: mine.length ? await sendableAt(studioId, userId) : [],
  };
}


/**
 * Every studio this account is staff at, with whether they run it.
 *
 * Deliberately session-derived rather than taking a user id: this is exported
 * from a `"use server"` file, so a parameter would be a callable endpoint for
 * reading anybody's affiliations.
 *
 * It exists so "Your studios" and the staff screen answer the same question
 * the same way. They did not for one build: this list joined `coach_studios`
 * alone while `staffing()` used the union that also counts having a class
 * there, so a coach who had only ever listed a class was staff to the screen
 * and a stranger to the list that was supposed to link them to it.
 */
export async function myStaffStudios(): Promise<
  { id: string; name: string; slug: string; admin: boolean }[]
> {
  const userId = await getSessionUserId();
  if (!userId) return [];
  const db = await getDb();
  const [picked, classRows, managed] = await Promise.all([
    db
      .select({ studioId: schema.coachStudios.studioId })
      .from(schema.coachStudios)
      .where(eq(schema.coachStudios.userId, userId)),
    db
      .select({ studioId: schema.classes.studioId })
      .from(schema.classes)
      .where(eq(schema.classes.userId, userId)),
    db
      .select({ studioId: schema.studioManagers.studioId })
      .from(schema.studioManagers)
      .where(eq(schema.studioManagers.userId, userId)),
  ]);
  const runs = new Set(managed.map((r) => r.studioId));
  const ids = [
    ...new Set(
      [...picked, ...classRows, ...managed]
        .map((r) => r.studioId)
        .filter((id): id is string => !!id),
    ),
  ];
  if (!ids.length) return [];
  const rows = await db.select().from(schema.studios).where(inArray(schema.studios.id, ids));
  return rows
    .map((s) => ({ id: s.id, name: s.name, slug: s.slug ?? s.id, admin: runs.has(s.id) }))
    // The places you run first: they carry the work that only you can do.
    .sort((a, b) => Number(b.admin) - Number(a.admin) || a.name.localeCompare(b.name));
}
