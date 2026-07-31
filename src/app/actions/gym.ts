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
  runsOn,
  timeToMinutes,
  todayIso,
} from "@/lib/format";
import { addNotification } from "@/lib/notify";
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
  /** 0 = Monday. Adding several makes several slots; one row is one slot. */
  days: number[];
  /** Set = a one-off pinned to this ISO date rather than a standing weekly. */
  specificDate?: string | null;
  /** Weekly only: the last date it runs. */
  endsOn?: string | null;
  startTime: string;
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
      links: [],
    };
    if (!cur.classType && c.classType) cur.classType = c.classType;
    if (!cur.description && c.description) cur.description = c.description;
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
  try {
    await db
      .insert(schema.studioClasses)
      .values({
        studioId,
        name,
        nameKey: name.toLowerCase(),
        classType,
        description,
        createdByUserId: userId,
      })
      .onConflictDoUpdate({
        target: [schema.studioClasses.studioId, schema.studioClasses.nameKey],
        set: {
          name,
          ...(classType ? { classType } : {}),
          ...(description ? { description } : {}),
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
  if (!Number.isInteger(input.durationMin) || input.durationMin < 5 || input.durationMin > 600)
    return "That length doesn't look right.";
  if (endsOn && !/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) return "That end date doesn't look right.";
  if (endsOn && endsOn < todayIso()) return "That end date has already passed.";
  return null;
}

/** "Mon, Wed & Fri 6:00am", or the date itself when it only runs once. */
function whenOf(input: GymClassInput): string {
  const { oneOff, days } = shape(input);
  return oneOff
    ? `${fmtDateLong(oneOff)}, ${fmtTime(input.startTime)}`
    : `${fmtDays(days)} ${fmtTime(input.startTime)}`;
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
  // One row per day, sharing a series so they read as one class where that
  // matters. Each row is still its own slot: the rota assigns Monday and
  // Wednesday separately, which is exactly what the spreadsheet's cells did.
  const seriesId = randomUUID();
  await db.insert(schema.classes).values(
    days.map((dayOfWeek) => ({
      userId: gymId,
      coachUserId,
      studioId,
      seriesId,
      dayOfWeek,
      specificDate: oneOff,
      endsOn,
      startTime: input.startTime,
      durationMin: input.durationMin,
      name,
      classType: input.classType?.trim() || null,
      description: input.description?.trim() || null,
      links: cleanLinks(input.links),
      isPublic: true,
    })),
  );
  await catalogue(db, studioId, ctx.userId, input);
  if (coachUserId) await tellCoach(coachUserId, studio.name, name, whenOf(input), true);
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  return { ok: true, count: days.length };
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
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await shiftFor(classId, occurrenceDate);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { db, userId, me, cls, studio, cover, on } = ctx;
  if (on) return { ok: false, error: "Somebody is already on that one." };
  if (me?.kind === "fan") return { ok: false, error: "That's for coaches at this studio." };
  if (!(await coachesHere(db, studio.id)).has(userId))
    return { ok: false, error: "That's for coaches at this studio." };

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
