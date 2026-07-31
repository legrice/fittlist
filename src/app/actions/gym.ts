"use server";

import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { DAYS, fmtTime } from "@/lib/format";
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
  coachUserId: string | null;
  coachName: string;
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

export async function gymSchedule(studioId: string): Promise<GymClassDto[]> {
  const ctx = await actingFor(studioId);
  if ("error" in ctx) return [];
  const { db, gymId } = ctx;
  const rows = await db
    .select()
    .from(schema.classes)
    .where(and(eq(schema.classes.userId, gymId), eq(schema.classes.studioId, studioId)))
    .orderBy(asc(schema.classes.dayOfWeek), asc(schema.classes.startTime));
  const coachIds = [...new Set(rows.map((r) => r.coachUserId).filter((x): x is string => !!x))];
  const people = coachIds.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, coachIds))
    : [];
  const nameOf = new Map(
    people.map((p) => [p.id, p.name.trim() || p.email.split("@")[0]] as const),
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    classType: r.classType,
    dayOfWeek: r.dayOfWeek,
    startTime: r.startTime,
    durationMin: r.durationMin,
    coachUserId: r.coachUserId,
    coachName: (r.coachUserId && nameOf.get(r.coachUserId)) || "",
  }));
}

export type GymClassInput = {
  name: string;
  dayOfWeek: number;
  startTime: string;
  durationMin: number;
  classType?: string;
  coachUserId?: string | null;
};

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
    isPublic: true,
  });
  if (coachUserId) await tellCoach(coachUserId, studio.name, { ...input, name: input.name.trim() }, true);
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  return { ok: true };
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
    })
    .where(eq(schema.classes.id, classId));

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
  await db.delete(schema.classes).where(eq(schema.classes.id, classId));
  if (existing.coachUserId) await tellCoach(existing.coachUserId, studio.name, existing, false);
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  return { ok: true };
}
