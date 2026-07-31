"use server";

import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import {
  DAYS,
  fmtDateLong,
  fmtDayHeader,
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
// One row is one slot, mirroring the spreadsheet's one cell per class. A
// weekly class taught twice a week is two rows: nothing here needs the
// weekday-series dance a coach's own adder does, and skipping it means an edit
// never deletes and reinserts a row, so a Going mark on it is never at risk.

export type GymClassDto = {
  id: string;
  name: string;
  classType: string | null;
  dayOfWeek: number;
  startTime: string;
  durationMin: number;
  /** Who normally teaches it, week in week out. */
  description: string | null;
  links: { label: string; url: string }[];
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

export type GymClassInput = {
  name: string;
  dayOfWeek: number;
  startTime: string;
  durationMin: number;
  classType?: string | null;
  description?: string;
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

function validate(input: GymClassInput): string | null {
  if (!input.name.trim()) return "Give the class a name.";
  if (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 0 || input.dayOfWeek > 6)
    return "Pick a day.";
  if (!/^\d{2}:\d{2}$/.test(input.startTime)) return "Pick a start time.";
  if (!Number.isInteger(input.durationMin) || input.durationMin < 5 || input.durationMin > 600)
    return "That length doesn't look right.";
  return null;
}

/** Tell a coach they are on, or that they are off. Silence is how a shift gets
 *  missed, which is the thing the spreadsheet did that cost somebody a class. */
async function tellCoach(
  coachUserId: string,
  studioName: string,
  row: { name: string; dayOfWeek: number; startTime: string },
  on: boolean,
) {
  await addNotification(coachUserId, {
    type: on ? "shift_assigned" : "shift_dropped",
    title: on
      ? `You're coaching ${row.name}`
      : `You're off ${row.name}`,
    body: `${DAYS[row.dayOfWeek]} ${fmtTime(row.startTime)} at ${studioName}.`,
    href: "/week",
  });
}

export async function addGymClass(
  studioId: string,
  input: GymClassInput,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await actingFor(studioId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const bad = validate(input);
  if (bad) return { ok: false, error: bad };
  const { db, studio, gymId } = ctx;

  const coachUserId = input.coachUserId || null;
  await db.insert(schema.classes).values({
    userId: gymId,
    coachUserId,
    studioId,
    dayOfWeek: input.dayOfWeek,
    startTime: input.startTime,
    durationMin: input.durationMin,
    name: input.name.trim(),
    classType: input.classType?.trim() || null,
    description: input.description?.trim() || null,
    links: cleanLinks(input.links),
    isPublic: true,
  });
  await catalogue(db, studioId, ctx.userId, input);
  if (coachUserId) await tellCoach(coachUserId, studio.name, { ...input, name: input.name.trim() }, true);
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  return { ok: true };
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
  // Before the standing rota moves, write down what it used to be, so the
  // weeks that have already happened keep saying who taught them.
  if (existing.coachUserId !== coachUserId)
    await freezePast(db, existing, existing.coachUserId, ctx.userId);
  // Updated in place, never deleted and reinserted, so any Going mark on this
  // class survives the manager moving it half an hour.
  await db
    .update(schema.classes)
    .set({
      coachUserId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      durationMin: input.durationMin,
      name: input.name.trim(),
      classType: input.classType?.trim() || null,
      description: input.description?.trim() || null,
      links: cleanLinks(input.links),
    })
    .where(eq(schema.classes.id, classId));
  await catalogue(db, studioId, ctx.userId, input);

  // Only the people whose shift actually changed hear about it.
  if (existing.coachUserId !== coachUserId) {
    if (existing.coachUserId)
      await tellCoach(existing.coachUserId, studio.name, existing, false);
    if (coachUserId)
      await tellCoach(coachUserId, studio.name, { ...input, name: input.name.trim() }, true);
  }
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  return { ok: true };
}

export async function deleteGymClass(
  studioId: string,
  classId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await actingFor(studioId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { db, studio, gymId } = ctx;
  const [existing] = await db
    .select()
    .from(schema.classes)
    .where(and(eq(schema.classes.id, classId), eq(schema.classes.userId, gymId)));
  if (!existing) return { ok: false, error: "Class not found." };

  // A Going mark points at this row, so it has to go first or the delete fails
  // on the foreign key. Whoever was coming is told, the same as when a coach
  // cancels one of their own.
  const marks = await db
    .select({ userId: schema.attendances.userId })
    .from(schema.attendances)
    .where(eq(schema.attendances.classId, classId));
  for (const m of [...new Set(marks.map((r) => r.userId))]) {
    await addNotification(m, {
      type: "class_cancelled",
      title: `${existing.name} is off`,
      body: `${DAYS[existing.dayOfWeek]} ${fmtTime(existing.startTime)} at ${studio.name} is no longer on the schedule.`,
      href: "/week",
    });
  }
  await db.delete(schema.attendances).where(eq(schema.attendances.classId, classId));
  // Its exceptions go with it, or the foreign key refuses the delete.
  await db.delete(schema.shiftCovers).where(eq(schema.shiftCovers.classId, classId));
  await db.delete(schema.classes).where(eq(schema.classes.id, classId));
  if (existing.coachUserId) await tellCoach(existing.coachUserId, studio.name, existing, false);
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  return { ok: true };
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
