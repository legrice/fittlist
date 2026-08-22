"use server";

import { randomUUID } from "node:crypto";
import { and, eq, gte, ilike, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
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
import { createPlaceholderCoach } from "@/lib/roster";
import { sendInviteLink } from "@/lib/invite-link";
import { getSessionUserId } from "@/lib/session";
import { studioAccess } from "@/lib/studioaccess";
import { coachAnalytics } from "@/lib/visits";
import {
  isStudioPlannerColor,
  type StudioPlannerColor,
} from "@/lib/studio-planner";

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
  /** Private color label used only on the studio manager's planner. */
  plannerColor: StudioPlannerColor | null;
  /** Who normally teaches it, week in week out. */
  coachUserId: string | null;
  coachName: string;
  /** Who is actually on it this date, once covers are applied. */
  onUserId: string | null;
  onName: string;
  /** This date is an exception to the standing rota. */
  covered: boolean;
  /** A manager can prepare a slot before it appears on the public calendar. */
  isPublic: boolean;
};

export type GymDayDto = {
  iso: string;
  label: string;
  /** Monday = 0, shared by the week list and desktop month grid. */
  dayOfWeek: number;
  /** The studio is closed on this date; its classes remain intact underneath. */
  closed: boolean;
  items: GymClassDto[];
};
export type GymWeekDto = {
  /** Monday of the week being shown, and how far it is from this one. */
  monday: string;
  offset: number;
  label: string;
  days: GymDayDto[];
};
export type GymMonthDto = {
  /** YYYY-MM for month navigation. */
  month: string;
  label: string;
  /** Six Monday-through-Sunday rows, including the month's edge days. */
  days: GymDayDto[];
  /** Weekday indexes captured in the studio's reusable standard week. */
  standardDays: number[];
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

const ASSIGNABLE_ROSTER_STATES = ["active", "invited", "placeholder"];
const INTERACTIVE_ROSTER_STATES = ["active", "invited"];
export type StudioTeamRole = "coach" | "front_desk";

const isStudioTeamRole = (role: unknown): role is StudioTeamRole =>
  role === "coach" || role === "front_desk";

async function rosterHas(
  db: Awaited<ReturnType<typeof getDb>>,
  studioId: string,
  userId: string,
  states = ASSIGNABLE_ROSTER_STATES,
) {
  const [row] = await db
    .select({ id: schema.studioRotaCoaches.id })
    .from(schema.studioRotaCoaches)
    .where(
      and(
        eq(schema.studioRotaCoaches.studioId, studioId),
        eq(schema.studioRotaCoaches.userId, userId),
        eq(schema.studioRotaCoaches.role, "coach"),
        eq(schema.studioRotaCoaches.onSchedule, true),
        inArray(schema.studioRotaCoaches.state, states),
      ),
    );
  return !!row;
}

async function assignmentError(
  db: Awaited<ReturnType<typeof getDb>>,
  studioId: string,
  coachUserId: string | null,
) {
  if (!coachUserId) return null;
  const [coach] = await db
    .select({ kind: schema.users.kind })
    .from(schema.users)
    .where(eq(schema.users.id, coachUserId));
  if (!coach || coach.kind === "fan" || coach.kind === "gym") return "That's not a coach.";
  if (!(await rosterHas(db, studioId, coachUserId)))
    return "Invite this coach and turn on Schedule before assigning them.";
  return null;
}

/** The class already occupying a coach on one date, across every studio.
 * Covers are applied before comparing, so a coach who has been taken off
 * their regular class is genuinely free. Back-to-back classes do not overlap. */
async function coachConflictError(
  db: Awaited<ReturnType<typeof getDb>>,
  coachUserId: string | null,
  occurrenceDate: string,
  startTime: string,
  durationMin: number,
  ignoreClassId?: string,
): Promise<string | null> {
  if (!coachUserId) return null;
  const owned = await db
    .select()
    .from(schema.classes)
    .where(or(eq(schema.classes.coachUserId, coachUserId), eq(schema.classes.userId, coachUserId)));
  const covered = await db
    .select()
    .from(schema.shiftCovers)
    .where(
      and(
        eq(schema.shiftCovers.occurrenceDate, occurrenceDate),
        eq(schema.shiftCovers.coachUserId, coachUserId),
      ),
    );
  const extraIds = covered
    .map((row) => row.classId)
    .filter((id) => !owned.some((row) => row.id === id));
  const extra = extraIds.length
    ? await db.select().from(schema.classes).where(inArray(schema.classes.id, extraIds))
    : [];
  const rows = [...owned, ...extra];
  if (!rows.length) return null;
  const sameDayCovers = await db
    .select()
    .from(schema.shiftCovers)
    .where(
      and(
        eq(schema.shiftCovers.occurrenceDate, occurrenceDate),
        inArray(schema.shiftCovers.classId, rows.map((row) => row.id)),
      ),
    );
  const coverByClass = new Map(sameDayCovers.map((row) => [row.classId, row.coachUserId]));
  const studioIds = [...new Set(rows.map((row) => row.studioId).filter((id): id is string => !!id))];
  const [studios, closures] = await Promise.all([
    studioIds.length
      ? db.select({ id: schema.studios.id, name: schema.studios.name }).from(schema.studios).where(inArray(schema.studios.id, studioIds))
      : Promise.resolve([]),
    studioIds.length
      ? db.select({ studioId: schema.studioClosedDays.studioId }).from(schema.studioClosedDays).where(
          and(
            eq(schema.studioClosedDays.occurrenceDate, occurrenceDate),
            inArray(schema.studioClosedDays.studioId, studioIds),
          ),
        )
      : Promise.resolve([]),
  ]);
  const studioName = new Map(studios.map((studio) => [studio.id, studio.name]));
  const closed = new Set(closures.map((row) => row.studioId));
  const wantedStart = timeToMinutes(startTime);
  const wantedEnd = wantedStart + durationMin;
  for (const row of rows) {
    if (row.id === ignoreClassId || (row.studioId && closed.has(row.studioId))) continue;
    if (!runsOn(row, occurrenceDate, dowOfDate(occurrenceDate))) continue;
    const onUserId: string | null | undefined = coverByClass.has(row.id)
      ? coverByClass.get(row.id)
      : row.coachUserId ?? (row.userId === coachUserId ? coachUserId : null);
    if (onUserId !== coachUserId) continue;
    const rowStart = timeToMinutes(row.startTime);
    const rowEnd = rowStart + row.durationMin;
    if (wantedStart < rowEnd && rowStart < wantedEnd) {
      const where = row.studioId ? studioName.get(row.studioId) : null;
      const endTime = `${String(Math.floor(rowEnd / 60) % 24).padStart(2, "0")}:${String(rowEnd % 60).padStart(2, "0")}`;
      return `Schedule conflict: already coaching ${row.name}${where ? ` at ${where}` : ""}, ${fmtTime(row.startTime)}–${fmtTime(endTime)}.`;
    }
  }
  return null;
}

function nextOccurrence(dayOfWeek: number, fromIso = todayIso()) {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const fromDow = (from.getUTCDay() + 6) % 7;
  from.setUTCDate(from.getUTCDate() + ((dayOfWeek - fromDow + 7) % 7));
  return from.toISOString().slice(0, 10);
}

/** Everyone the studio has approved to be assigned to its calendar. */
export async function gymCoaches(studioId: string): Promise<GymCoachDto[]> {
  const ctx = await actingFor(studioId);
  if ("error" in ctx) return [];
  return gymCoachesFromDb(ctx.db, studioId);
}

async function gymCoachesFromDb(
  db: Awaited<ReturnType<typeof getDb>>,
  studioId: string,
): Promise<GymCoachDto[]> {
  const roster = await db
    .select({ userId: schema.studioRotaCoaches.userId })
    .from(schema.studioRotaCoaches)
    .where(
      and(
        eq(schema.studioRotaCoaches.studioId, studioId),
        eq(schema.studioRotaCoaches.role, "coach"),
        eq(schema.studioRotaCoaches.onSchedule, true),
        inArray(schema.studioRotaCoaches.state, ASSIGNABLE_ROSTER_STATES),
      ),
    );
  const ids = roster.map((row) => row.userId);
  if (!ids.length) return [];
  const people = await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, kind: schema.users.kind })
    .from(schema.users)
    .where(inArray(schema.users.id, ids));
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
async function gymDays(
  db: Awaited<ReturnType<typeof getDb>>,
  gymId: string,
  studioId: string,
  start: Date,
  count: number,
): Promise<GymDayDto[]> {
  const isoOf = (i: number) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  };
  const firstIso = isoOf(0);
  const lastIso = isoOf(count - 1);
  const rows = await db
    .select()
    .from(schema.classes)
    .where(and(eq(schema.classes.userId, gymId), eq(schema.classes.studioId, studioId)));

  const closures = await db
    .select()
    .from(schema.studioClosedDays)
    .where(
      and(
        eq(schema.studioClosedDays.studioId, studioId),
        gte(schema.studioClosedDays.occurrenceDate, firstIso),
        lte(schema.studioClosedDays.occurrenceDate, lastIso),
      ),
    );
  const closureByDate = new Map(closures.map((item) => [item.occurrenceDate, item]));

  // A manager only needs exceptions inside the range on screen. Loading the
  // studio's entire cover history made the old spreadsheet slower every month
  // it stayed in use.
  const covers = rows.length
    ? await db
        .select()
        .from(schema.shiftCovers)
        .where(
          and(
            inArray(schema.shiftCovers.classId, rows.map((r) => r.id)),
            gte(schema.shiftCovers.occurrenceDate, firstIso),
            lte(schema.shiftCovers.occurrenceDate, lastIso),
          ),
        )
    : [];
  const coverBy = new Map(covers.map((c) => [`${c.classId}|${c.occurrenceDate}`, c]));

  const ids = new Set<string>();
  for (const r of rows) if (r.coachUserId) ids.add(r.coachUserId);
  for (const c of covers) if (c.coachUserId) ids.add(c.coachUserId);
  const people = ids.size
    ? await db
        .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
        .from(schema.users)
        .where(inArray(schema.users.id, [...ids]))
    : [];
  const nameOf = new Map(
    people.map((p) => [p.id, p.name.trim() || p.email.split("@")[0]] as const),
  );

  const days: GymDayDto[] = [];
  for (let i = 0; i < count; i++) {
    const iso = isoOf(i);
    const dayOfWeek = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
    const closure = closureByDate.get(iso);
    const closedClassIds = new Set(closure?.classIds ?? []);
    const items = rows
      .filter((r) => closure ? closedClassIds.has(r.id) : runsOn(r, iso, dayOfWeek))
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
          plannerColor: isStudioPlannerColor(r.studioPlannerColor) ? r.studioPlannerColor : null,
          coachUserId: r.coachUserId,
          coachName: (r.coachUserId && nameOf.get(r.coachUserId)) || "",
          onUserId,
          onName: (onUserId && nameOf.get(onUserId)) || "",
          covered: !!cover,
          isPublic: r.isPublic,
        };
      });
    days.push({ iso, label: fmtDayHeader(iso), dayOfWeek, closed: !!closure, items });
  }
  return days;
}

export async function gymSchedule(studioId: string, offset = 0): Promise<GymWeekDto | null> {
  const ctx = await actingFor(studioId);
  if ("error" in ctx) return null;
  const { db, gymId } = ctx;

  const week = Math.max(0, Math.min(8, Math.trunc(offset) || 0));
  const start = new Date(`${mondayOfCurrentWeek()}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + week * 7);
  const monday = start.toISOString().slice(0, 10);
  const days = await gymDays(db, gymId, studioId, start, 7);
  const sunday = new Date(start);
  sunday.setUTCDate(start.getUTCDate() + 6);
  const rangePart = (date: Date) => date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  return {
    monday,
    offset: week,
    label: `${rangePart(start)} – ${rangePart(sunday)}`,
    days,
  };
}

/** Six-week desktop planning grid. It is requested lazily by the client only
 * at the desktop breakpoint, so mobile never pays for a month it cannot use. */
export async function gymMonth(
  studioId: string,
  monthInput?: string,
): Promise<GymMonthDto | null> {
  const ctx = await actingFor(studioId);
  if ("error" in ctx) return null;
  const requestedMonth = /^\d{4}-\d{2}$/.test(monthInput ?? "")
    ? monthInput!
    : todayIso().slice(0, 7);
  // This is a planning surface. Recurring rows do not yet carry a historical
  // start date, so showing months before today would invent classes that may
  // not have existed then.
  const currentMonth = todayIso().slice(0, 7);
  const month = requestedMonth < currentMonth ? currentMonth : requestedMonth;
  const [year, monthNumber] = month.split("-").map(Number);
  if (year < 2020 || year > 2100 || monthNumber < 1 || monthNumber > 12) return null;
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const mondayIndex = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - mondayIndex);
  const days = await gymDays(ctx.db, ctx.gymId, studioId, start, 42);
  return {
    month,
    label: first.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    days,
    standardDays: Object.entries(ctx.studio.standardWeek ?? {})
      .filter(([, slots]) => Array.isArray(slots) && slots.length > 0)
      .map(([day]) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
  };
}

/** Capture the seven class days around an anchor as the reusable week.
 * Staffing is deliberately omitted: the standard week is the class source of
 * truth, while coach assignments remain a separate dated rota. */
export async function saveStandardWeek(
  studioId: string,
  anchorDate: string,
): Promise<{ ok: boolean; error?: string; count?: number }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) return { ok: false, error: "Pick a date." };
  const ctx = await actingFor(studioId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const anchor = new Date(`${anchorDate}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() - dowOfDate(anchorDate));
  const week = await gymDays(ctx.db, ctx.gymId, studioId, anchor, 7);
  const standardWeek: schema.StandardWeek = {};
  let count = 0;
  for (const day of week) {
    const slots = day.closed ? [] : day.items.map((item) => ({
      name: item.name,
      classType: item.classType,
      description: item.description,
      image: item.image,
      startTime: item.startTime,
      durationMin: item.durationMin,
      links: item.links,
      plannerColor: item.plannerColor,
      isPublic: item.isPublic,
    }));
    standardWeek[String(day.dayOfWeek) as keyof schema.StandardWeek] = slots;
    count += slots.length;
  }
  await ctx.db
    .update(schema.studios)
    .set({ standardWeek })
    .where(eq(schema.studios.id, studioId));
  revalidatePath(`/s/${ctx.studio.slug ?? ctx.studio.id}/manage`);
  return { ok: true, count };
}

/** Add one weekday from the standard week to a real date. Existing rows win,
 * including their coach assignments. New standard classes begin Open: class
 * structure comes from the template, staffing never does. */
export async function applyStandardDay(
  studioId: string,
  targetDate: string,
): Promise<{ ok: boolean; error?: string; added?: number; duplicates?: number; conflicts?: string[] }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return { ok: false, error: "Pick a date." };
  const ctx = await actingFor(studioId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const dayOfWeek = dowOfDate(targetDate);
  const slots = ctx.studio.standardWeek?.[String(dayOfWeek) as keyof schema.StandardWeek] ?? [];
  if (!slots.length) return { ok: false, error: `No standard ${DAYS[dayOfWeek]} has been saved yet.` };
  const date = new Date(`${targetDate}T00:00:00Z`);
  const [target] = await gymDays(ctx.db, ctx.gymId, studioId, date, 1);
  const existing = new Set(
    (target?.items ?? []).map((item) => `${item.name.trim().toLowerCase()}|${item.startTime.slice(0, 5)}`),
  );
  let duplicates = 0;
  const rows: (typeof schema.classes.$inferInsert)[] = [];
  for (const slot of slots) {
    const identity = `${slot.name.trim().toLowerCase()}|${slot.startTime.slice(0, 5)}`;
    if (existing.has(identity)) {
      duplicates++;
      continue;
    }
    rows.push({
      userId: ctx.gymId,
      coachUserId: null,
      studioId,
      seriesId: randomUUID(),
      dayOfWeek,
      specificDate: targetDate,
      startTime: slot.startTime,
      durationMin: slot.durationMin,
      name: slot.name,
      classType: slot.classType,
      description: slot.description,
      image: slot.image,
      links: slot.links,
      studioPlannerColor: isStudioPlannerColor(slot.plannerColor) ? slot.plannerColor : null,
      isPublic: slot.isPublic,
    });
    existing.add(identity);
  }
  if (rows.length) await ctx.db.insert(schema.classes).values(rows);
  revalidatePath(`/s/${ctx.studio.slug ?? ctx.studio.id}/manage`);
  revalidatePath(`/s/${ctx.studio.slug ?? ctx.studio.id}`);
  return { ok: true, added: rows.length, duplicates, conflicts: [] };
}

/**
 * The same shape the coach's adder sends, because it is the same adder. A gym
 * fills in a class the way a coach does: name, type, description, the days it
 * runs, when it starts and how long, where a member books it. The two fields
 * that are only a gym's are `coachUserId`, which is the rota, and the private
 * planner color used to scan this management calendar.
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
  /** Private palette token saved with the studio's reusable class identity. */
  plannerColor?: StudioPlannerColor | null;
  /** The saved studio class this slot came from. Kept while its display name
   *  is edited so the class can be renamed everywhere without touching its
   *  schedule. */
  catalogKey?: string | null;
  /** False keeps a new or edited slot in the manager's draft schedule. */
  isPublic?: boolean;
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
  plannerColor: StudioPlannerColor | null;
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
      plannerColor: isStudioPlannerColor(c.studioPlannerColor) ? c.studioPlannerColor : null,
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
      plannerColor: isStudioPlannerColor(c.studioPlannerColor) ? c.studioPlannerColor : null,
    };
    if (!cur.classType && c.classType) cur.classType = c.classType;
    if (!cur.description && c.description) cur.description = c.description;
    if (!cur.image && c.image) cur.image = c.image;
    if (!cur.durationMin && c.durationMin) cur.durationMin = c.durationMin;
    if (!cur.links.length && c.links.length) cur.links = c.links.map((l) => ({ ...l }));
    if (!cur.plannerColor && isStudioPlannerColor(c.studioPlannerColor))
      cur.plannerColor = c.studioPlannerColor;
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
  previousKey?: string | null,
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
        studioPlannerColor: input.plannerColor ?? null,
        createdByUserId: userId,
      })
      .onConflictDoUpdate({
        target: [schema.studioClasses.studioId, schema.studioClasses.nameKey],
        set: {
          name,
          classType,
          description,
          image,
          durationMin,
          ...(input.plannerColor !== undefined
            ? { studioPlannerColor: input.plannerColor }
            : {}),
          updatedAt: new Date(),
        },
      });
    const nextKey = name.toLowerCase();
    if (previousKey && previousKey !== nextKey)
      await db
        .delete(schema.studioClasses)
        .where(
          and(
            eq(schema.studioClasses.studioId, studioId),
            eq(schema.studioClasses.nameKey, previousKey),
          ),
        );
  } catch (err) {
    console.error("studio catalog upsert failed", err);
  }
}

/** A studio class is the reusable thing; a schedule row only says when it
 * runs and who is on it. Keep the reusable fields identical on every slot so
 * editing Barbell Club once changes Barbell Club throughout the planner. */
async function syncStudioClassIdentity(
  db: Awaited<ReturnType<typeof getDb>>,
  studioId: string,
  gymId: string,
  previousKey: string,
  input: GymClassInput,
) {
  await db
    .update(schema.classes)
    .set({
      name: input.name.trim(),
      classType: input.classType?.trim() || null,
      description: input.description?.trim() || null,
      image: input.image?.trim() || null,
      durationMin: input.durationMin,
      links: cleanLinks(input.links),
      studioPlannerColor: input.plannerColor ?? null,
    })
    .where(
      and(
        eq(schema.classes.userId, gymId),
        eq(schema.classes.studioId, studioId),
        sql`lower(trim(${schema.classes.name})) = ${previousKey}`,
      ),
    );
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
  if (
    input.plannerColor !== undefined &&
    input.plannerColor !== null &&
    !isStudioPlannerColor(input.plannerColor)
  )
    return "Choose one of the calendar colors.";
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
  const coachError = await assignmentError(db, studioId, coachUserId);
  if (coachError) return { ok: false, error: coachError };
  const name = input.name.trim();
  const identityKey = input.catalogKey?.trim().toLowerCase() || name.toLowerCase();
  const { oneOff, days, endsOn } = shape(input);
  const times = timesOf(input);

  for (let index = 1; index < times.length; index++) {
    if (timeToMinutes(times[index]) < timeToMinutes(times[index - 1]) + input.durationMin)
      return {
        ok: false,
        error: `Schedule conflict: ${fmtTime(times[index - 1])} and ${fmtTime(times[index])} overlap.`,
      };
  }

  if (coachUserId) {
    for (const dayOfWeek of days) {
      const occurrenceDate = oneOff ?? nextOccurrence(dayOfWeek);
      if (endsOn && occurrenceDate > endsOn) continue;
      for (const startTime of times) {
        const conflict = await coachConflictError(
          db,
          coachUserId,
          occurrenceDate,
          startTime,
          input.durationMin,
        );
        if (conflict) return { ok: false, error: conflict };
      }
    }
  }

  // What this studio already runs under this name, so a second pass over the
  // same class doesn't double the week. A manager will re-open a class to add
  // the times they forgot, and the honest answer to "Monday 6am again" is to
  // leave the slot that is already there alone: it may carry a coach, a swap
  // and a room full of members' plans.
  const existing = await db
    .select({ dayOfWeek: schema.classes.dayOfWeek, startTime: schema.classes.startTime })
    .from(schema.classes)
    .where(
      and(
        eq(schema.classes.userId, gymId),
        eq(schema.classes.studioId, studioId),
        sql`lower(trim(${schema.classes.name})) = ${identityKey}`,
      ),
    );
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
        studioPlannerColor: input.plannerColor ?? null,
        isPublic: input.isPublic !== false,
      });
    }
  }
  if (!rows.length) return { ok: false, error: "Those already run at this studio." };
  await db.insert(schema.classes).values(rows);
  await catalogue(db, studioId, ctx.userId, input, identityKey);
  await syncStudioClassIdentity(db, studioId, gymId, identityKey, input);
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
 * ran open. Permanent transfers may also pass a future `untilIso`; dates
 * before the selected hand-over stay with the old coach as explicit covers.
 */
async function freezePast(
  db: Awaited<ReturnType<typeof getDb>>,
  cls: typeof schema.classes.$inferSelect,
  wasCoachUserId: string | null,
  byUserId: string,
  untilIso = todayIso(),
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
  while (cursor < untilIso) {
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
  const coachError = await assignmentError(db, studioId, coachUserId);
  if (coachError) return { ok: false, error: coachError };
  const name = input.name.trim();
  // One row is one slot, so an edit is about the slot that was opened: the day
  // pills move it rather than fanning it out. Adding a second day is adding a
  // second slot, which the rota does from the day it belongs to.
  const { oneOff, days, endsOn } = shape(input);
  const dayOfWeek = days[0];

  if (coachUserId) {
    const occurrenceDate = oneOff ?? nextOccurrence(dayOfWeek);
    if (!endsOn || occurrenceDate <= endsOn) {
      const conflict = await coachConflictError(
        db,
        coachUserId,
        occurrenceDate,
        input.startTime,
        input.durationMin,
        classId,
      );
      if (conflict) return { ok: false, error: conflict };
    }
  }

  // Before the standing rota moves, write down what it used to be, so the
  // weeks that have already happened keep saying who taught them.
  if (existing.coachUserId !== coachUserId)
    await freezePast(db, existing, existing.coachUserId, ctx.userId);
  // Updated in place, never deleted and reinserted, so any Going mark on this
  // class survives the manager moving it half an hour. These are schedule
  // fields only; reusable class details are synchronized just below.
  const [updated] = await db
    .update(schema.classes)
    .set({
      coachUserId,
      dayOfWeek,
      specificDate: oneOff,
      endsOn,
      startTime: input.startTime,
      isPublic: input.isPublic !== false,
    })
    .where(eq(schema.classes.id, classId))
    .returning();
  const identityKey = existing.name.trim().toLowerCase();
  await catalogue(db, studioId, ctx.userId, input, identityKey);
  await syncStudioClassIdentity(db, studioId, gymId, identityKey, input);

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

/** Put every prepared studio slot live together. Drafts still show in the
 * manager rota, but never leak into Discover or the studio's public calendar
 * until this deliberate publish step. */
export async function publishGymDrafts(
  studioId: string,
): Promise<{ ok: boolean; error?: string; count?: number }> {
  const ctx = await actingFor(studioId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { db, studio, gymId } = ctx;
  const drafts = await db
    .select({ id: schema.classes.id })
    .from(schema.classes)
    .where(
      and(
        eq(schema.classes.userId, gymId),
        eq(schema.classes.studioId, studioId),
        eq(schema.classes.isPublic, false),
      ),
    );
  if (!drafts.length) return { ok: true, count: 0 };
  await db
    .update(schema.classes)
    .set({ isPublic: true })
    .where(inArray(schema.classes.id, drafts.map((d) => d.id)));
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  revalidatePath(`/s/${studio.slug ?? studio.id}/manage`);
  return { ok: true, count: drafts.length };
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
      // A request for a date that is no longer happening cannot be approved
      // later. Keep the slot's history when it exists, but remove live asks
      // before the occurrence disappears from the rota.
      await db
        .delete(schema.shiftRequests)
        .where(
          and(
            eq(schema.shiftRequests.classId, classId),
            eq(schema.shiftRequests.occurrenceDate, iso),
            eq(schema.shiftRequests.state, "pending"),
          ),
        );
      const when = `${fmtDateLong(iso)}, ${fmtTime(existing.startTime)}`;
      await tellComers(when, iso);
      if (wasOn && iso >= today)
        await tellCoach(wasOn, studio.name, existing.name, when, false);
    }
    revalidatePath(`/s/${studio.slug ?? studio.id}`);
    return { ok: true, count: 1 };
  }

  await tellComers(whenOfRow(existing));
  // Its dependent rota records go with it, or their foreign keys refuse the
  // delete. Answered requests are no longer useful once the slot itself is
  // gone, and this keeps an old request from making a schedule uneditable.
  await db.delete(schema.shiftRequests).where(eq(schema.shiftRequests.classId, classId));
  await db.delete(schema.shiftCovers).where(eq(schema.shiftCovers.classId, classId));
  await db.delete(schema.classes).where(eq(schema.classes.id, classId));
  if (existing.coachUserId)
    await tellCoach(existing.coachUserId, studio.name, existing.name, whenOfRow(existing), false);
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  return { ok: true, count: 1 };
}

/** Close every class at a studio for one date (a holiday, weather day, etc.). */
export async function closeGymDay(
  studioId: string,
  occurrenceDate: string,
): Promise<{ ok: boolean; error?: string; count?: number }> {
  const ctx = await actingFor(studioId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) return { ok: false, error: "Bad date." };
  if (occurrenceDate < todayIso()) return { ok: false, error: "That date has already passed." };
  const { db, studio, gymId, userId } = ctx;
  const [alreadyClosed] = await db
    .select()
    .from(schema.studioClosedDays)
    .where(
      and(
        eq(schema.studioClosedDays.studioId, studioId),
        eq(schema.studioClosedDays.occurrenceDate, occurrenceDate),
      ),
    );
  if (alreadyClosed) return { ok: true, count: alreadyClosed.classIds.length };
  const dow = dowOfDate(occurrenceDate);
  const all = await db
    .select()
    .from(schema.classes)
    .where(and(eq(schema.classes.userId, gymId), eq(schema.classes.studioId, studioId)));
  const rows = all.filter((row) => runsOn(row, occurrenceDate, dow));
  const classIds = rows.map((row) => row.id);
  const [marks, covers] = classIds.length
    ? await Promise.all([
        db
          .select({ classId: schema.attendances.classId, userId: schema.attendances.userId })
          .from(schema.attendances)
          .where(
            and(
              inArray(schema.attendances.classId, classIds),
              eq(schema.attendances.occurrenceDate, occurrenceDate),
            ),
          ),
        db
          .select()
          .from(schema.shiftCovers)
          .where(
            and(
              inArray(schema.shiftCovers.classId, classIds),
              eq(schema.shiftCovers.occurrenceDate, occurrenceDate),
            ),
          ),
      ])
    : [[], []];
  const classById = new Map(rows.map((row) => [row.id, row]));
  await db.transaction(async (tx) => {
    await tx.insert(schema.studioClosedDays).values({
      studioId,
      occurrenceDate,
      classIds,
      createdByUserId: userId,
    });
    for (const row of rows) {
      await tx
        .update(schema.classes)
        .set({ skipDates: [...new Set([...row.skipDates, occurrenceDate])].sort() })
        .where(eq(schema.classes.id, row.id));
    }
  });

  const when = fmtDateLong(occurrenceDate);
  for (const mark of marks) {
    const cls = classById.get(mark.classId);
    if (!cls) continue;
    await addNotification(mark.userId, {
      type: "class_cancelled",
      title: `${cls.name} is off`,
      body: `${when} at ${studio.name} is no longer on the schedule.`,
      href: "/week",
    });
  }
  for (const row of rows) {
    const cover = covers.find((item) => item.classId === row.id);
    const coachId = cover ? cover.coachUserId : row.coachUserId;
    if (coachId) await tellCoach(coachId, studio.name, row.name, `${when}, ${fmtTime(row.startTime)}`, false);
  }
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  revalidatePath(`/s/${studio.slug ?? studio.id}/manage`);
  revalidatePath(`/s/${studio.slug ?? studio.id}/shifts`);
  revalidatePath("/calendar");
  return { ok: true, count: rows.length };
}

/** Reopen a studio date and restore the exact classes preserved by closing it. */
export async function openGymDay(
  studioId: string,
  occurrenceDate: string,
): Promise<{ ok: boolean; error?: string; count?: number }> {
  const ctx = await actingFor(studioId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) return { ok: false, error: "Bad date." };
  if (occurrenceDate < todayIso()) return { ok: false, error: "That date has already passed." };
  const { db, studio, gymId } = ctx;
  const [closure] = await db
    .select()
    .from(schema.studioClosedDays)
    .where(
      and(
        eq(schema.studioClosedDays.studioId, studioId),
        eq(schema.studioClosedDays.occurrenceDate, occurrenceDate),
      ),
    );
  if (!closure) return { ok: true, count: 0 };
  const rows = closure.classIds.length
    ? await db
        .select()
        .from(schema.classes)
        .where(
          and(
            inArray(schema.classes.id, closure.classIds),
            eq(schema.classes.userId, gymId),
            eq(schema.classes.studioId, studioId),
          ),
        )
    : [];
  const classIds = rows.map((row) => row.id);
  const [marks, covers] = classIds.length
    ? await Promise.all([
        db
          .select({ classId: schema.attendances.classId, userId: schema.attendances.userId })
          .from(schema.attendances)
          .where(
            and(
              inArray(schema.attendances.classId, classIds),
              eq(schema.attendances.occurrenceDate, occurrenceDate),
            ),
          ),
        db
          .select()
          .from(schema.shiftCovers)
          .where(
            and(
              inArray(schema.shiftCovers.classId, classIds),
              eq(schema.shiftCovers.occurrenceDate, occurrenceDate),
            ),
          ),
      ])
    : [[], []];
  await db.transaction(async (tx) => {
    for (const row of rows)
      await tx
        .update(schema.classes)
        .set({ skipDates: row.skipDates.filter((date) => date !== occurrenceDate) })
        .where(eq(schema.classes.id, row.id));
    await tx.delete(schema.studioClosedDays).where(eq(schema.studioClosedDays.id, closure.id));
  });

  const when = fmtDateLong(occurrenceDate);
  const classById = new Map(rows.map((row) => [row.id, row]));
  for (const mark of marks) {
    const cls = classById.get(mark.classId);
    if (!cls) continue;
    await addNotification(mark.userId, {
      type: "class_updated",
      title: `${cls.name} is back on`,
      body: `${when} at ${studio.name} has reopened.`,
      href: "/week",
    });
  }
  for (const row of rows) {
    const cover = covers.find((item) => item.classId === row.id);
    const coachId = cover ? cover.coachUserId : row.coachUserId;
    if (coachId) await tellCoach(coachId, studio.name, row.name, `${when}, ${fmtTime(row.startTime)}`, true);
  }
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  revalidatePath(`/s/${studio.slug ?? studio.id}/manage`);
  revalidatePath(`/s/${studio.slug ?? studio.id}/shifts`);
  revalidatePath("/calendar");
  return { ok: true, count: rows.length };
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

  const coachError = await assignmentError(db, studioId, coachUserId);
  if (coachError) return { ok: false, error: coachError };

  const [cls] = await db
    .select()
    .from(schema.classes)
    .where(and(eq(schema.classes.id, classId), eq(schema.classes.userId, gymId)));
  if (!cls) return { ok: false, error: "Class not found." };
  const dow = (new Date(`${occurrenceDate}T00:00:00Z`).getUTCDay() + 6) % 7;
  if (!runsOn(cls, occurrenceDate, dow))
    return { ok: false, error: "That class doesn't run that day." };
  const conflict = await coachConflictError(
    db,
    coachUserId,
    occurrenceDate,
    cls.startTime,
    cls.durationMin,
    cls.id,
  );
  if (conflict) return { ok: false, error: conflict };

  const changed = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.shiftCovers)
      .where(
        and(
          eq(schema.shiftCovers.classId, classId),
          eq(schema.shiftCovers.occurrenceDate, occurrenceDate),
        ),
      );
    const before = existing ? existing.coachUserId : cls.coachUserId;

    if (before !== coachUserId) {
      if (coachUserId === cls.coachUserId) {
        // Back to normal: the exception stops existing.
        if (existing) await tx.delete(schema.shiftCovers).where(eq(schema.shiftCovers.id, existing.id));
      } else if (existing) {
        await tx
          .update(schema.shiftCovers)
          .set({ coachUserId, createdByUserId: userId })
          .where(eq(schema.shiftCovers.id, existing.id));
      } else {
        await tx
          .insert(schema.shiftCovers)
          .values({ classId, occurrenceDate, coachUserId, createdByUserId: userId })
          .onConflictDoUpdate({
            target: [schema.shiftCovers.classId, schema.shiftCovers.occurrenceDate],
            set: { coachUserId, createdByUserId: userId },
          });
      }
    }

    // A manager's direct choice is authoritative for this occurrence. Close
    // every live pickup or transfer at the same time as the rota write so an
    // old request cannot later overwrite the person the manager just chose.
    await tx
      .update(schema.shiftRequests)
      .set({ state: "declined", decidedByUserId: userId, decidedAt: new Date() })
      .where(
        and(
          eq(schema.shiftRequests.classId, classId),
          eq(schema.shiftRequests.occurrenceDate, occurrenceDate),
          eq(schema.shiftRequests.state, "pending"),
        ),
      );

    return { before, assignmentChanged: before !== coachUserId };
  });

  // Re-selecting the current coach can still be an explicit decision that
  // closes stale requests, but it should not send a duplicate shift notice.
  if (changed.assignmentChanged) {
    // Both sides of a swap hear about it, and only about their own half. The
    // date is the whole point, so it leads.
    const when = `${fmtDateLong(occurrenceDate)}, ${fmtTime(cls.startTime)}`;
    if (changed.before)
      await addNotification(changed.before, {
        type: "shift_dropped",
        title: `You're off ${cls.name}`,
        body: coachUserId
          ? `${when} at ${studio.name}. Somebody else is on it.`
          : `${when} at ${studio.name}. The slot is open.`,
        href: "/week",
      });
    if (coachUserId)
      await addNotification(coachUserId, {
        type: "shift_assigned",
        title: `You're covering ${cls.name}`,
        body: `${when} at ${studio.name}.`,
        href: "/week",
      });
  }
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  revalidatePath(`/s/${studio.slug ?? studio.id}/manage`);
  revalidatePath(`/s/${studio.slug ?? studio.id}/manage/staff`);
  revalidatePath(`/s/${studio.slug ?? studio.id}/shifts`);
  revalidatePath("/app");
  revalidatePath("/calendar");
  revalidatePath("/week");
  return { ok: true };
}

/**
 * Who can take a slot here: the coaches who teach at this studio.
 *
 * This is the studio's approved, interactive shift roster—not everybody who
 * has self-listed the studio. It is the one permission boundary coaches and
 * managers both rely on.
 */
async function coachesHere(
  db: Awaited<ReturnType<typeof getDb>>,
  studioId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ userId: schema.studioRotaCoaches.userId })
    .from(schema.studioRotaCoaches)
    .where(
      and(
        eq(schema.studioRotaCoaches.studioId, studioId),
        eq(schema.studioRotaCoaches.role, "coach"),
        eq(schema.studioRotaCoaches.onSchedule, true),
        inArray(schema.studioRotaCoaches.state, INTERACTIVE_ROSTER_STATES),
      ),
    );
  return new Set(rows.map((row) => row.userId));
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
  const conflict = await coachConflictError(
    db,
    userId,
    occurrenceDate,
    cls.startTime,
    cls.durationMin,
    cls.id,
  );
  if (conflict) return { ok: false, error: conflict };

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
 * Hand a date, or the standing weekly slot from that date forward, to a
 * named coach.
 *
 * Giving up opens the slot and hopes; this is the other thing that actually
 * happens at a gym, where the swap was agreed over the counter and just needs
 * writing down. Only the coach on the date can hand it on, and only the
 * regular coach may change every week going forward. The recipient must be
 * somebody on the gym's shift list: anyone may say they coach here, and the
 * list is the gym saying who really takes these classes. The studio's shift
 * approval setting decides whether it lands immediately or waits for a
 * manager.
 */
export async function sendShiftTo(
  classId: string,
  occurrenceDate: string,
  toUserId: string,
  scope: "occurrence" | "standing" = "occurrence",
): Promise<{ ok: boolean; error?: string; pending?: boolean }> {
  if (scope !== "occurrence" && scope !== "standing")
    return { ok: false, error: "Choose one class or every week." };
  const ctx = await shiftFor(classId, occurrenceDate);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { db, userId, me, cls, studio, cover, on } = ctx;
  if (on !== userId) return { ok: false, error: "You aren't on that one." };
  if (toUserId === userId) return { ok: false, error: "That's already you." };
  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, toUserId));
  if (!target || target.kind === "fan" || target.kind === "gym")
    return { ok: false, error: "That's not a coach here." };
  if (!(await rosterHas(db, studio.id, toUserId, INTERACTIVE_ROSTER_STATES)))
    return { ok: false, error: "They aren't on this gym's shift list." };
  if (scope === "standing" && cls.coachUserId !== userId)
    return { ok: false, error: "Only the regular coach can transfer every week." };
  const conflict = await coachConflictError(
    db,
    toUserId,
    occurrenceDate,
    cls.startTime,
    cls.durationMin,
    cls.id,
  );
  if (conflict) return { ok: false, error: conflict };

  // Handing a date back to whoever normally teaches it is putting the rota
  // back the way it was, so there is nothing for a manager to weigh.
  if (scope === "standing" || toUserId !== cls.coachUserId) {
    const filed = await fileRequest(db, {
      studio,
      cls,
      occurrenceDate,
      kind: "transfer",
      scope,
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
        title:
          scope === "standing"
            ? `You've been asked to take over ${cls.name}`
            : `You've been asked to cover ${cls.name}`,
        body:
          scope === "standing"
            ? `Starting ${fmtDateLong(occurrenceDate)}, every ${DAYS[cls.dayOfWeek]} at ${fmtTime(cls.startTime)} at ${studio.name}. Waiting on the studio.`
            : `${fmtDateLong(occurrenceDate)}, ${fmtTime(cls.startTime)} at ${studio.name}. Waiting on the studio.`,
        href: `/s/${studio.slug ?? studio.id}/${cls.id}?d=${occurrenceDate}`,
        actorUserId: userId,
      });
      return { ok: true, pending: true };
    }
  }

  if (scope === "standing") {
    await freezePast(db, cls, cls.coachUserId, userId, occurrenceDate);
    await db
      .update(schema.classes)
      .set({ coachUserId: toUserId })
      .where(eq(schema.classes.id, cls.id));
    await db
      .update(schema.shiftRequests)
      .set({ state: "declined", decidedByUserId: userId, decidedAt: new Date() })
      .where(
        and(
          eq(schema.shiftRequests.classId, cls.id),
          eq(schema.shiftRequests.state, "pending"),
        ),
      );
    const who = me?.name?.trim() || "A coach";
    const toName = target.name.trim() || target.email.split("@")[0];
    await addNotification(toUserId, {
      type: "shift_assigned",
      title: `You're the regular coach for ${cls.name}`,
      body: `Starting ${fmtDateLong(occurrenceDate)}, every ${DAYS[cls.dayOfWeek]} at ${fmtTime(cls.startTime)} at ${studio.name}. ${who} transferred it to you.`,
      href: `/s/${studio.slug ?? studio.id}/${cls.id}?d=${occurrenceDate}`,
      actorUserId: userId,
    });
    await tellTheGym(
      db,
      studio,
      [userId, toUserId],
      {
        type: "shift_assigned",
        title: `${who} transferred ${cls.name} to ${toName}`,
        body: `Starting ${fmtDateLong(occurrenceDate)}, every ${DAYS[cls.dayOfWeek]} at ${fmtTime(cls.startTime)}.`,
        href: `/s/${studio.slug ?? studio.id}/manage/calendar`,
        actorUserId: userId,
      },
      false,
    );
    revalidatePath("/app");
    revalidatePath(`/s/${studio.slug ?? studio.id}`);
    revalidatePath(`/s/${studio.slug ?? studio.id}/manage`);
    return { ok: true };
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

/** Load the stat in the closed admin overflow only when a manager opens it.
 * Keeping this out of the calendar's initial data wave saves an unrelated
 * aggregate query on every planner visit. */
export async function studioPageViews(
  studioId: string,
): Promise<{ ok: boolean; pageViews: number | null; error?: string }> {
  const ctx = await managing(studioId);
  if ("error" in ctx) return { ok: false, pageViews: null, error: ctx.error };
  if (!ctx.studio.accountUserId) return { ok: true, pageViews: null };
  const analytics = await coachAnalytics(ctx.studio.accountUserId);
  return { ok: true, pageViews: analytics.profileViews };
}

/** Let the people who run a claimed studio turn on its independent schedule. */
export async function enableStudioSchedule(
  studioId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await managing(studioId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { db, studio } = ctx;
  if (studio.accountUserId) return { ok: true };
  const [account] = await db
    .insert(schema.users)
    .values({
      kind: "gym",
      email: `studio.${studio.id}@gym.fittlist.invalid`,
      name: studio.name,
      handle: null,
      discoverable: false,
      onboardedAt: new Date(),
    })
    .returning();
  await db
    .update(schema.studios)
    .set({ accountUserId: account.id })
    .where(and(eq(schema.studios.id, studioId), isNull(schema.studios.accountUserId)));
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  revalidatePath(`/s/${studio.slug ?? studio.id}/manage`);
  revalidatePath(`/s/${studio.slug ?? studio.id}/manage/staff`);
  revalidatePath(`/s/${studio.slug ?? studio.id}/shifts`);
  return { ok: true };
}

const ROSTER_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type StudioCoachSearchResult = {
  id: string;
  name: string;
  handle: string | null;
  photo: string | null;
  color: string | null;
};

/** Search-first roster adding: only return people who can actually coach and
 * are not already associated with this studio. Email stays server-side. */
export async function searchStudioCoachCandidates(
  studioId: string,
  queryRaw: string,
  role: StudioTeamRole = "coach",
): Promise<StudioCoachSearchResult[]> {
  const ctx = await managing(studioId);
  if ("error" in ctx) return [];
  if (!isStudioTeamRole(role)) return [];
  const query = queryRaw.trim();
  if (query.length < 2) return [];
  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  const [people, roster] = await Promise.all([
    ctx.db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        handle: schema.users.handle,
        photoThumb: schema.users.photoThumb,
        photo: schema.users.photo,
        color: schema.users.avatarColor,
      })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.discoverable, true),
          role === "coach"
            ? inArray(schema.users.kind, ["coach", "admin"])
            : inArray(schema.users.kind, ["fan", "coach", "admin"]),
          or(ilike(schema.users.name, pattern), ilike(schema.users.handle, pattern)),
        ),
      )
      .limit(16),
    ctx.db
      .select({ userId: schema.studioRotaCoaches.userId })
      .from(schema.studioRotaCoaches)
      .where(eq(schema.studioRotaCoaches.studioId, studioId)),
  ]);
  const already = new Set(roster.map((row) => row.userId));
  return people
    .filter((person) => !already.has(person.id))
    .map((person) => ({
      id: person.id,
      name: person.name.trim() || person.handle || "Coach",
      handle: person.handle,
      photo: person.photoThumb ?? person.photo ?? null,
      color: person.color,
    }));
}

/** Associate an existing FittList coach without exposing their email to the
 * manager's browser. */
export async function addExistingStudioCoach(
  studioId: string,
  coachUserId: string,
  role: StudioTeamRole = "coach",
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await managing(studioId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!isStudioTeamRole(role)) return { ok: false, error: "Choose a staff role." };
  const { db, userId, studio } = ctx;
  const [person] = await db
    .select({ id: schema.users.id, kind: schema.users.kind })
    .from(schema.users)
    .where(eq(schema.users.id, coachUserId));
  if (!person || person.kind === "gym" || person.kind === "placeholder")
    return { ok: false, error: "That person could not be added." };
  if (role === "coach" && person.kind !== "coach" && person.kind !== "admin")
    return { ok: false, error: "That account is not set up as a coach." };
  const [already] = await db
    .select({ id: schema.studioRotaCoaches.id })
    .from(schema.studioRotaCoaches)
    .where(
      and(
        eq(schema.studioRotaCoaches.studioId, studioId),
        eq(schema.studioRotaCoaches.userId, coachUserId),
      ),
    );
  if (already) return { ok: false, error: "They're already associated with this studio." };
  await db.insert(schema.studioRotaCoaches).values({
    studioId,
    userId: coachUserId,
    state: "active",
    role,
    onSchedule: role === "coach",
    acceptedAt: new Date(),
  });
  await addNotification(coachUserId, {
    type: "shift_assigned",
    title: `You're on ${studio.name}'s team`,
    body: role === "coach"
      ? "The studio can put you on its calendar and send you coverage requests."
      : "The studio added you to its front desk team.",
    href: role === "coach" ? `/s/${studio.slug ?? studio.id}/shifts` : `/s/${studio.slug ?? studio.id}`,
    actorUserId: userId,
  });
  revalidatePath(`/s/${studio.slug ?? studio.id}/manage`);
  revalidatePath(`/s/${studio.slug ?? studio.id}/manage/staff`);
  return { ok: true };
}

/** Invite a person to this studio's roster, whether or not they have joined yet. */
export async function inviteStudioCoach(
  studioId: string,
  nameRaw: string,
  emailRaw: string,
  role: StudioTeamRole = "coach",
): Promise<{ ok: boolean; error?: string; invited?: boolean }> {
  const ctx = await managing(studioId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  if (!isStudioTeamRole(role)) return { ok: false, error: "Choose a staff role." };
  const { db, userId, studio } = ctx;
  const name = nameRaw.trim().slice(0, 80);
  const email = emailRaw.trim().toLowerCase();
  if (!name) return { ok: false, error: "Add their name first." };
  if (!email) return { ok: false, error: "Add their email so we can invite them." };
  if (!ROSTER_EMAIL_RE.test(email)) return { ok: false, error: "That email doesn't look right." };

  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (existing) {
    if (existing.kind === "gym" || existing.kind === "placeholder")
      return { ok: false, error: "That account cannot be added to staff." };
    if (role === "coach" && existing.kind === "fan")
      return { ok: false, error: "That account isn't a coach." };
    const [already] = await db
      .select({ id: schema.studioRotaCoaches.id })
      .from(schema.studioRotaCoaches)
      .where(
        and(
          eq(schema.studioRotaCoaches.studioId, studioId),
          eq(schema.studioRotaCoaches.userId, existing.id),
        ),
      );
    if (already) return { ok: false, error: "They're already associated with this studio." };
    await db
      .insert(schema.studioRotaCoaches)
      .values({
        studioId,
        userId: existing.id,
        state: "active",
        role,
        onSchedule: role === "coach",
        acceptedAt: new Date(),
      });
    await addNotification(existing.id, {
      type: "shift_assigned",
      title: `You're on ${studio.name}'s team`,
      body: role === "coach"
        ? "The studio can put you on its calendar and send you coverage requests."
        : "The studio added you to its front desk team.",
      href: role === "coach" ? `/s/${studio.slug ?? studio.id}/shifts` : `/s/${studio.slug ?? studio.id}`,
      actorUserId: userId,
    });
    revalidatePath(`/s/${studio.slug ?? studio.id}/manage`);
    revalidatePath(`/s/${studio.slug ?? studio.id}/manage/staff`);
    return { ok: true };
  }

  const [already] = await db
    .select({ id: schema.studioRotaCoaches.id })
    .from(schema.studioRotaCoaches)
    .where(
      and(
        eq(schema.studioRotaCoaches.studioId, studioId),
        eq(schema.studioRotaCoaches.invitedEmail, email),
        eq(schema.studioRotaCoaches.state, "placeholder"),
      ),
    );
  if (!already) {
    try {
      await createPlaceholderCoach({ studioId, name, email, role });
    } catch {
      // The partial unique index is the authority if two managers invite the
      // same address together. Treat the losing insert as a resend instead of
      // surfacing a database error or leaving an orphan placeholder account.
      const [raced] = await db
        .select({ id: schema.studioRotaCoaches.id })
        .from(schema.studioRotaCoaches)
        .where(
          and(
            eq(schema.studioRotaCoaches.studioId, studioId),
            eq(schema.studioRotaCoaches.invitedEmail, email),
            eq(schema.studioRotaCoaches.state, "placeholder"),
          ),
        );
      if (!raced) return { ok: false, error: "Couldn't prepare that invite. Try again." };
    }
  }
  try {
    await sendInviteLink({
      email,
      subject: `${studio.name} invited you to their FittList team`,
      intro: role === "coach"
        ? `${studio.name} added you to their coach roster. Tap to join FittList and see the classes you're on`
        : `${studio.name} added you to their front desk team. Tap to join FittList`,
      invite: true,
    });
  } catch {
    // Keep the placeholder so the same email can retry safely. The branch
    // above deliberately resends an existing pending invitation.
    return { ok: false, error: "The invite couldn't be sent. Try again." };
  }
  revalidatePath(`/s/${studio.slug ?? studio.id}/manage`);
  revalidatePath(`/s/${studio.slug ?? studio.id}/manage/staff`);
  revalidatePath(`/s/${studio.slug ?? studio.id}/shifts`);
  return { ok: true, invited: true };
}

/** Whether taking a coach off the working schedule would strand an upcoming
 *  standing assignment or dated cover. Both removing the association and
 *  turning schedule eligibility off use the same guard so the calendar never
 *  names somebody who can no longer use it. */
async function hasFutureStudioAssignment(
  db: Awaited<ReturnType<typeof getDb>>,
  studio: typeof schema.studios.$inferSelect,
  userId: string,
): Promise<boolean> {
  if (!studio.accountUserId) return false;
  const today = todayIso();
  const slots = await db
    .select({
      id: schema.classes.id,
      coachUserId: schema.classes.coachUserId,
      specificDate: schema.classes.specificDate,
      endsOn: schema.classes.endsOn,
    })
    .from(schema.classes)
    .where(
      and(
        eq(schema.classes.userId, studio.accountUserId),
        eq(schema.classes.studioId, studio.id),
      ),
    );
  const standing = slots.some(
    (slot) =>
      slot.coachUserId === userId &&
      (slot.specificDate ? slot.specificDate >= today : !slot.endsOn || slot.endsOn >= today),
  );
  if (standing || !slots.length) return standing;
  const [cover] = await db
    .select({ id: schema.shiftCovers.id })
    .from(schema.shiftCovers)
    .where(
      and(
        inArray(schema.shiftCovers.classId, slots.map((slot) => slot.id)),
        eq(schema.shiftCovers.coachUserId, userId),
        gte(schema.shiftCovers.occurrenceDate, today),
      ),
    )
    .limit(1);
  return !!cover;
}

/** Keep a coach associated with the studio while deciding whether they may be
 *  assigned to its calendar or participate in coverage. Managers only. */
export async function setStudioCoachScheduled(
  studioId: string,
  userId: string,
  onSchedule: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await managing(studioId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { db, studio } = ctx;
  if (typeof onSchedule !== "boolean") return { ok: false, error: "Choose a schedule status." };
  const [row] = await db
    .select({
      id: schema.studioRotaCoaches.id,
      state: schema.studioRotaCoaches.state,
      role: schema.studioRotaCoaches.role,
    })
    .from(schema.studioRotaCoaches)
    .where(
      and(
        eq(schema.studioRotaCoaches.studioId, studioId),
        eq(schema.studioRotaCoaches.userId, userId),
      ),
    );
  if (!row) return { ok: false, error: "That person isn't associated with this studio." };
  if (row.role !== "coach") return { ok: false, error: "Only coaches can be put on the schedule." };
  if (onSchedule && !ASSIGNABLE_ROSTER_STATES.includes(row.state))
    return { ok: false, error: "Invite this coach before putting them on the schedule." };
  if (!onSchedule && (await hasFutureStudioAssignment(db, studio, userId)))
    return { ok: false, error: "Reassign or open their future shifts first." };
  await db
    .update(schema.studioRotaCoaches)
    .set({ onSchedule })
    .where(eq(schema.studioRotaCoaches.id, row.id));
  const slug = studio.slug ?? studio.id;
  revalidatePath(`/s/${slug}/manage`);
  revalidatePath(`/s/${slug}/manage/staff`);
  revalidatePath(`/s/${slug}/manage/staff/${userId}`);
  revalidatePath(`/s/${slug}/shifts`);
  revalidatePath("/app");
  revalidatePath("/calendar");
  revalidatePath("/week");
  return { ok: true };
}

/** Remove a studio-owned coach association. Future assignments must be moved
 *  or opened first so removing a person cannot leave an unreachable rota. */
export async function removeStudioCoach(
  studioId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await managing(studioId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { db, studio } = ctx;
  const [row] = await db
    .select({ id: schema.studioRotaCoaches.id })
    .from(schema.studioRotaCoaches)
    .where(
      and(
        eq(schema.studioRotaCoaches.studioId, studioId),
        eq(schema.studioRotaCoaches.userId, userId),
      ),
    );
  if (!row) return { ok: false, error: "That person isn't associated with this studio." };
  if (await hasFutureStudioAssignment(db, studio, userId))
    return { ok: false, error: "Reassign or open their future shifts before removing them." };
  await db.delete(schema.studioRotaCoaches).where(eq(schema.studioRotaCoaches.id, row.id));
  const slug = studio.slug ?? studio.id;
  revalidatePath(`/s/${slug}/manage`);
  revalidatePath(`/s/${slug}/manage/staff`);
  revalidatePath(`/s/${slug}/manage/staff/${userId}`);
  revalidatePath(`/s/${slug}/shifts`);
  revalidatePath("/app");
  revalidatePath("/calendar");
  revalidatePath("/week");
  return { ok: true };
}

export type StaffPerson = {
  id: string;
  name: string;
  email: string;
  isYou: boolean;
  isOwner: boolean;
};

/** Focused loader for the Admin access view in Studio settings. It avoids
 * loading the coach roster just to show the small list of page managers. */
export async function studioManagersForSettings(studioId: string): Promise<{
  people: StaffPerson[];
  canManage: boolean;
}> {
  const ctx = await managing(studioId);
  if ("error" in ctx) return { people: [], canManage: false };
  const rows = await ctx.db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
    })
    .from(schema.studioManagers)
    .innerJoin(schema.users, eq(schema.users.id, schema.studioManagers.userId))
    .where(eq(schema.studioManagers.studioId, studioId));
  const people = rows
    .map((person) => ({
      id: person.id,
      name: person.name.trim() || person.email.split("@")[0],
      email: person.email,
      isYou: person.id === ctx.userId,
      isOwner: person.id === ctx.studio.ownerUserId,
    }))
    .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.name.localeCompare(b.name));
  return {
    people,
    canManage: ctx.studio.ownerUserId === ctx.userId,
  };
}
export type StudioStaffDto = {
  /** One directory of everyone who works here. Permission roles and working
   * roles can coexist, so an owner who coaches reads Owner · Coach once. */
  people: {
    id: string;
    name: string;
    email: string | null;
    photo: string | null;
    color: string | null;
    state: string;
    onSchedule: boolean;
    staffRole: StudioTeamRole | null;
    roles: ("owner" | "manager" | StudioTeamRole)[];
    weeklyClassCount: number;
  }[];
  hasSchedule: boolean;
};

/** A single slim pass over this week's effective rota for the Staff list.
 * Covers belong to the person actually teaching that date, while closed days
 * do not inflate anyone's workload. */
async function studioStaffWeekCounts(
  db: Awaited<ReturnType<typeof getDb>>,
  studio: typeof schema.studios.$inferSelect,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!studio.accountUserId) return counts;
  const monday = new Date(`${mondayOfCurrentWeek()}T00:00:00Z`);
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
  const rows = await db
    .select({
      id: schema.classes.id,
      coachUserId: schema.classes.coachUserId,
      dayOfWeek: schema.classes.dayOfWeek,
      specificDate: schema.classes.specificDate,
      endsOn: schema.classes.endsOn,
      skipDates: schema.classes.skipDates,
    })
    .from(schema.classes)
    .where(
      and(
        eq(schema.classes.userId, studio.accountUserId),
        eq(schema.classes.studioId, studio.id),
        or(
          and(
            gte(schema.classes.specificDate, dates[0]),
            lte(schema.classes.specificDate, dates[6]),
          ),
          and(
            isNull(schema.classes.specificDate),
            or(isNull(schema.classes.endsOn), gte(schema.classes.endsOn, dates[0])),
          ),
        ),
      ),
    );
  if (!rows.length) return counts;
  const [covers, closures] = await Promise.all([
    db
      .select({
        classId: schema.shiftCovers.classId,
        occurrenceDate: schema.shiftCovers.occurrenceDate,
        coachUserId: schema.shiftCovers.coachUserId,
      })
      .from(schema.shiftCovers)
      .where(
        and(
          inArray(schema.shiftCovers.classId, rows.map((row) => row.id)),
          gte(schema.shiftCovers.occurrenceDate, dates[0]),
          lte(schema.shiftCovers.occurrenceDate, dates[6]),
        ),
      ),
    db
      .select({ occurrenceDate: schema.studioClosedDays.occurrenceDate })
      .from(schema.studioClosedDays)
      .where(
        and(
          eq(schema.studioClosedDays.studioId, studio.id),
          gte(schema.studioClosedDays.occurrenceDate, dates[0]),
          lte(schema.studioClosedDays.occurrenceDate, dates[6]),
        ),
      ),
  ]);
  const coverByOccurrence = new Map(
    covers.map((cover) => [`${cover.classId}|${cover.occurrenceDate}`, cover.coachUserId]),
  );
  const closedDates = new Set(closures.map((closure) => closure.occurrenceDate));
  for (const [dayOfWeek, iso] of dates.entries()) {
    if (closedDates.has(iso)) continue;
    for (const row of rows) {
      if (!runsOn(row, iso, dayOfWeek)) continue;
      const key = `${row.id}|${iso}`;
      const coachUserId = coverByOccurrence.has(key)
        ? coverByOccurrence.get(key)
        : row.coachUserId;
      if (coachUserId) counts.set(coachUserId, (counts.get(coachUserId) ?? 0) + 1);
    }
  }
  return counts;
}

/** The complete studio team: owner, managers, coaches, and front desk. */
export async function studioStaff(studioId: string): Promise<StudioStaffDto | null> {
  const ctx = await managing(studioId);
  if ("error" in ctx) return null;
  const { db, studio } = ctx;
  const [rosterRows, managerRows] = await Promise.all([
    db
      .select({
        userId: schema.studioRotaCoaches.userId,
        state: schema.studioRotaCoaches.state,
        role: schema.studioRotaCoaches.role,
        invitedEmail: schema.studioRotaCoaches.invitedEmail,
        onSchedule: schema.studioRotaCoaches.onSchedule,
      })
      .from(schema.studioRotaCoaches)
      .where(eq(schema.studioRotaCoaches.studioId, studioId)),
    db
      .select({ userId: schema.studioManagers.userId })
      .from(schema.studioManagers)
      .where(eq(schema.studioManagers.studioId, studioId)),
  ]);
  const personIds = [...new Set([
    ...(studio.ownerUserId ? [studio.ownerUserId] : []),
    ...rosterRows.map((row) => row.userId),
    ...managerRows.map((row) => row.userId),
  ])];
  const [teamPeople, weeklyClassCounts] = await Promise.all([
    personIds.length
      ? db
          .select({
            id: schema.users.id,
            name: schema.users.name,
            email: schema.users.email,
            kind: schema.users.kind,
            photoThumb: schema.users.photoThumb,
            photo: schema.users.photo,
            color: schema.users.avatarColor,
          })
          .from(schema.users)
          .where(inArray(schema.users.id, personIds))
      : Promise.resolve([]),
    studioStaffWeekCounts(db, studio),
  ]);
  const personById = new Map(teamPeople.map((person) => [person.id, person]));
  const rosterById = new Map(rosterRows.map((row) => [row.userId, row]));
  const managerIds = new Set(managerRows.map((row) => row.userId));
  const roleRank = (roles: ("owner" | "manager" | StudioTeamRole)[]) => roles.includes("owner")
    ? 0
    : roles.includes("manager")
      ? 1
      : roles.includes("coach")
        ? 2
        : 3;
  const people = personIds
    .map((id) => {
      const person = personById.get(id);
      const roster = rosterById.get(id);
      const roles: ("owner" | "manager" | StudioTeamRole)[] = [];
      if (id === studio.ownerUserId) roles.push("owner");
      else if (managerIds.has(id)) roles.push("manager");
      if (roster?.role === "front_desk") roles.push("front_desk");
      else if (roster) roles.push("coach");
      return {
        id,
        name: person?.name.trim() || "Staff member",
        email: roster?.invitedEmail ?? (person?.kind === "placeholder" ? null : person?.email ?? null),
        photo: person?.photoThumb ?? person?.photo ?? null,
        color: person?.color ?? null,
        state: roster?.state ?? "active",
        onSchedule: roster?.role === "coach" && roster.onSchedule,
        staffRole: roster && isStudioTeamRole(roster.role) ? roster.role : roster ? "coach" : null,
        roles,
        weeklyClassCount: weeklyClassCounts.get(id) ?? 0,
      };
    })
    .sort((a, b) => roleRank(a.roles) - roleRank(b.roles) || a.name.localeCompare(b.name));
  return { people, hasSchedule: !!studio.accountUserId };
}

export type StudioCoachDetailDto = {
  id: string;
  name: string;
  email: string | null;
  photo: string | null;
  color: string | null;
  state: string;
  onSchedule: boolean;
  role: StudioTeamRole;
  month: string;
  monthLabel: string;
  firstLabel: string;
  secondLabel: string;
  first: number;
  second: number;
  total: number;
  coaches: GymCoachDto[];
  shifts: {
    classId: string;
    name: string;
    date: string;
    dateLabel: string;
    startTime: string;
    coachUserId: string | null;
    onUserId: string;
    covered: boolean;
    isPublic: boolean;
    plannerColor: StudioPlannerColor | null;
  }[];
};

/** One invited coach, with the calendar-derived count a manager needs when
 * deciding whether to change or remove their access. */
export async function studioCoachDetail(
  studioId: string,
  coachId: string,
  monthIso?: string,
): Promise<StudioCoachDetailDto | null> {
  const ctx = await managing(studioId);
  if ("error" in ctx) return null;
  const { db, studio } = ctx;
  const [rosterRows, people] = await Promise.all([
    db
      .select({
        state: schema.studioRotaCoaches.state,
        invitedEmail: schema.studioRotaCoaches.invitedEmail,
        onSchedule: schema.studioRotaCoaches.onSchedule,
        role: schema.studioRotaCoaches.role,
      })
      .from(schema.studioRotaCoaches)
      .where(
        and(
          eq(schema.studioRotaCoaches.studioId, studioId),
          eq(schema.studioRotaCoaches.userId, coachId),
        ),
      ),
    db
      .select({
        name: schema.users.name,
        email: schema.users.email,
        kind: schema.users.kind,
        photoThumb: schema.users.photoThumb,
        photo: schema.users.photo,
        color: schema.users.avatarColor,
      })
      .from(schema.users)
      .where(eq(schema.users.id, coachId)),
  ]);
  const [roster] = rosterRows;
  if (!roster) return null;
  const [person] = people;
  if (!person) return null;

  const month = /^\d{4}-\d{2}$/.test(monthIso ?? "") ? monthIso! : todayIso().slice(0, 7);
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const firstIso = `${month}-01`;
  const monthStart = new Date(`${firstIso}T00:00:00Z`);
  const staffRole: StudioTeamRole = roster.role === "front_desk" ? "front_desk" : "coach";
  const [calendarDays, coaches] = await Promise.all([
    staffRole === "coach" && studio.accountUserId
      ? gymDays(db, studio.accountUserId, studioId, monthStart, daysInMonth)
      : Promise.resolve([]),
    staffRole === "coach" ? gymCoachesFromDb(db, studioId) : Promise.resolve([]),
  ]);
  const shifts = calendarDays
    .filter((day) => !day.closed)
    .flatMap((day) => day.items
      .filter((slot) => slot.onUserId === coachId)
      .map((slot) => ({
        classId: slot.id,
        name: slot.name,
        date: day.iso,
        dateLabel: new Date(`${day.iso}T00:00:00Z`).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }),
        startTime: slot.startTime,
        coachUserId: slot.coachUserId,
        onUserId: coachId,
        covered: slot.covered,
        isPublic: slot.isPublic,
        plannerColor: slot.plannerColor,
      })));
  const first = shifts.filter((shift) => Number(shift.date.slice(8, 10)) <= 15).length;
  const second = shifts.length - first;
  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return {
    id: coachId,
    name: person.name.trim() || "Coach",
    email: roster.invitedEmail ?? (person.kind === "placeholder" ? null : person.email),
    photo: person.photoThumb ?? person.photo,
    color: person.color,
    state: roster.state,
    onSchedule: roster.onSchedule,
    role: staffRole,
    month,
    monthLabel,
    firstLabel: "1st to 15th",
    secondLabel: `16th to ${daysInMonth}`,
    first,
    second,
    total: first + second,
    coaches,
    shifts,
  };
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
  if (studio.ownerUserId && studio.ownerUserId !== userId)
    return { ok: false, error: "Only the studio owner can add managers." };
  if (!studio.ownerUserId) {
    await db.update(schema.studios).set({ ownerUserId: userId }).where(eq(schema.studios.id, studioId));
  }
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
  revalidatePath(`/s/${studio.slug ?? studio.id}/manage`);
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
  const { db, userId, studio } = ctx;
  if (studio.ownerUserId && studio.ownerUserId !== userId)
    return { ok: false, error: "Only the studio owner can remove managers." };
  if (targetId === (studio.ownerUserId ?? userId))
    return { ok: false, error: "Transfer ownership before removing the owner." };
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
  revalidatePath(`/s/${studio.slug ?? studio.id}/manage`);
  revalidatePath(`/s/${studio.slug ?? studio.id}/manage/staff`);
  return { ok: true };
}

/** Hand the one master role to an existing manager. The previous owner stays
 * on as a manager, so a transfer never locks them out by surprise. */
export async function transferStudioOwnership(
  studioId: string,
  targetId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await managing(studioId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { db, userId, studio } = ctx;
  if ((studio.ownerUserId ?? userId) !== userId)
    return { ok: false, error: "Only the studio owner can transfer ownership." };
  const [target] = await db
    .select({ id: schema.studioManagers.id })
    .from(schema.studioManagers)
    .where(
      and(
        eq(schema.studioManagers.studioId, studioId),
        eq(schema.studioManagers.userId, targetId),
      ),
    );
  if (!target) return { ok: false, error: "Make them a manager before transferring ownership." };
  await db.update(schema.studios).set({ ownerUserId: targetId }).where(eq(schema.studios.id, studioId));
  await addNotification(targetId, {
    type: "studio_manager",
    title: `You own ${studio.name} on fittlist`,
    body: "You can manage the studio and choose its managers.",
    href: `/s/${studio.slug ?? studio.id}/manage`,
    actorUserId: userId,
  });
  revalidatePath(`/s/${studio.slug ?? studio.id}/manage`);
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
  scope: "occurrence" | "standing";
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

/** One studio policy for both one-date covers and permanent hand-overs. */
export async function setStudioShiftApproval(
  studioId: string,
  approve: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await managing(studioId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { db, studio } = ctx;
  await db
    .update(schema.studios)
    .set({ approveShiftChanges: approve })
    .where(eq(schema.studios.id, studioId));
  revalidatePath(`/s/${studio.slug ?? studio.id}/manage`);
  revalidatePath(`/s/${studio.slug ?? studio.id}/shifts`);
  return { ok: true };
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
    scope?: "occurrence" | "standing";
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
    scope: args.scope ?? "occurrence",
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
          : args.scope === "standing"
            ? `${args.askerName} wants to transfer ${args.cls.name} to ${args.toName}`
            : `${args.askerName} is handing ${args.cls.name} to ${args.toName}`,
      body:
        args.scope === "standing"
          ? `Starting ${fmtDateLong(args.occurrenceDate)}, every ${DAYS[args.cls.dayOfWeek]} at ${fmtTime(args.cls.startTime)}. Waiting on you.`
          : `${when}. Waiting on you.`,
      href: `/s/${args.studio.slug ?? args.studio.id}/manage`,
      actorUserId: args.askedBy,
    },
    false,
  );
  revalidatePath(`/s/${args.studio.slug ?? args.studio.id}/manage`);
  return { filed: true };
}

/** Everything waiting on this studio, newest first. Managers only. */
export async function shiftRequests(studioId: string): Promise<ShiftRequestDto[]> {
  const ctx = await managing(studioId);
  if ("error" in ctx) return [];
  const { db, userId } = ctx;
  const rows = await db
    .select({
      id: schema.shiftRequests.id,
      kind: schema.shiftRequests.kind,
      scope: schema.shiftRequests.scope,
      classId: schema.shiftRequests.classId,
      occurrenceDate: schema.shiftRequests.occurrenceDate,
      fromUserId: schema.shiftRequests.fromUserId,
      toUserId: schema.shiftRequests.toUserId,
      createdAt: schema.shiftRequests.createdAt,
    })
    .from(schema.shiftRequests)
    .where(and(eq(schema.shiftRequests.studioId, studioId), eq(schema.shiftRequests.state, "pending")));
  if (!rows.length) return [];
  const ids = [...new Set(rows.flatMap((r) => [r.toUserId, r.fromUserId].filter(Boolean) as string[]))];
  const people = ids.length
    ? await db
        .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
        .from(schema.users)
        .where(inArray(schema.users.id, ids))
    : [];
  const nameOf = new Map(people.map((p) => [p.id, p.name.trim() || p.email.split("@")[0]]));
  const clsIds = [...new Set(rows.map((r) => r.classId))];
  const clsRows = await db
    .select({
      id: schema.classes.id,
      name: schema.classes.name,
      startTime: schema.classes.startTime,
      dayOfWeek: schema.classes.dayOfWeek,
    })
    .from(schema.classes)
    .where(inArray(schema.classes.id, clsIds));
  const clsById = new Map(clsRows.map((c) => [c.id, c]));
  return rows
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((r) => {
      const c = clsById.get(r.classId);
      return {
        id: r.id,
        kind: r.kind as "pickup" | "transfer",
        scope: r.scope === "standing" ? "standing" : "occurrence",
        className: c?.name ?? "A class",
        whenLong: c
          ? r.scope === "standing"
            ? `Starting ${fmtDateLong(r.occurrenceDate)}, every ${DAYS[c.dayOfWeek]} at ${fmtTime(c.startTime)}`
            : `${fmtDateLong(r.occurrenceDate)}, ${fmtTime(c.startTime)}`
          : fmtDateLong(r.occurrenceDate),
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
  if (approve) {
    const [requestedClass] = await db
      .select()
      .from(schema.classes)
      .where(eq(schema.classes.id, req.classId));
    if (!requestedClass) return { ok: false, error: "That class is gone." };
    const conflict = await coachConflictError(
      db,
      req.toUserId,
      req.occurrenceDate,
      requestedClass.startTime,
      requestedClass.durationMin,
      requestedClass.id,
    );
    if (conflict) return { ok: false, error: conflict };
  }
  // Changing the standing coach would otherwise rewrite history. Preserve
  // every completed occurrence before the transactional ownership change.
  if (approve && req.scope === "standing") {
    const [standing] = await db
      .select()
      .from(schema.classes)
      .where(eq(schema.classes.id, req.classId));
    if (!standing) return { ok: false, error: "That class is gone." };
    if (standing.coachUserId !== req.fromUserId)
      return { ok: false, error: "The regular coach has changed since this was offered." };
    await freezePast(db, standing, standing.coachUserId, userId, req.occurrenceDate);
  }
  const settled = await db.transaction(async (tx) => {
    // Conditional state changes make two managers answering the same request
    // safe. A second answer sees no pending row and leaves the rota alone.
    const [live] = await tx
      .select()
      .from(schema.shiftRequests)
      .where(and(eq(schema.shiftRequests.id, requestId), eq(schema.shiftRequests.state, "pending")));
    if (!live) return { error: "That one is already answered." } as const;
    // Every request for an occurrence shares this class row. Locking it makes
    // competing manager approvals serialize before either reads or writes the
    // dated cover, instead of racing the unique class/date constraint.
    const [cls] = await tx
      .select()
      .from(schema.classes)
      .where(eq(schema.classes.id, live.classId))
      .for("update");
    if (!cls) return { error: "That class is gone." } as const;
    if (
      live.occurrenceDate < todayIso() ||
      !runsOn(cls, live.occurrenceDate, dowOfDate(live.occurrenceDate))
    )
      return { error: "That class no longer runs then." } as const;

    if (approve) {
      const [eligible] = await tx
        .select({ id: schema.studioRotaCoaches.id })
        .from(schema.studioRotaCoaches)
        .where(
          and(
            eq(schema.studioRotaCoaches.studioId, live.studioId),
            eq(schema.studioRotaCoaches.userId, live.toUserId),
            eq(schema.studioRotaCoaches.role, "coach"),
            eq(schema.studioRotaCoaches.onSchedule, true),
            inArray(schema.studioRotaCoaches.state, INTERACTIVE_ROSTER_STATES),
          ),
        );
      if (!eligible) return { error: "That coach is no longer on the shift list." } as const;
    }

    const [cover] = await tx
      .select()
      .from(schema.shiftCovers)
      .where(
        and(
          eq(schema.shiftCovers.classId, live.classId),
          eq(schema.shiftCovers.occurrenceDate, live.occurrenceDate),
        ),
      );
    const currentOn = cover ? cover.coachUserId : cls.coachUserId;
    if (approve && live.kind === "pickup" && currentOn)
      return { error: "Somebody is already on that one." } as const;
    if (approve && live.kind === "transfer") {
      if (live.scope === "standing" && cls.coachUserId !== live.fromUserId)
        return { error: "The regular coach has changed since this was offered." } as const;
      if (live.scope !== "standing" && currentOn !== live.fromUserId)
        return { error: "That shift has changed since it was offered." } as const;
    }

    const [changed] = await tx
      .update(schema.shiftRequests)
      .set({ state: approve ? "approved" : "declined", decidedByUserId: userId, decidedAt: new Date() })
      .where(and(eq(schema.shiftRequests.id, requestId), eq(schema.shiftRequests.state, "pending")))
      .returning({ id: schema.shiftRequests.id });
    if (!changed) return { error: "That one is already answered." } as const;

    if (approve) {
      // The request and the date's cover are one transaction. Settling one
      // request also closes every competing ask for the same occurrence.
      if (live.scope === "standing") {
        await tx
          .update(schema.classes)
          .set({ coachUserId: live.toUserId })
          .where(eq(schema.classes.id, live.classId));
      } else if (live.toUserId === cls.coachUserId) {
        if (cover) await tx.delete(schema.shiftCovers).where(eq(schema.shiftCovers.id, cover.id));
      } else if (cover) {
        await tx
          .update(schema.shiftCovers)
          .set({ coachUserId: live.toUserId, createdByUserId: userId })
          .where(eq(schema.shiftCovers.id, cover.id));
      } else {
        await tx.insert(schema.shiftCovers).values({
          classId: live.classId,
          occurrenceDate: live.occurrenceDate,
          coachUserId: live.toUserId,
          createdByUserId: userId,
        });
      }
      await tx
        .update(schema.shiftRequests)
        .set({ state: "declined", decidedByUserId: userId, decidedAt: new Date() })
        .where(
          and(
            eq(schema.shiftRequests.classId, live.classId),
            ...(live.scope === "standing"
              ? []
              : [eq(schema.shiftRequests.occurrenceDate, live.occurrenceDate)]),
            eq(schema.shiftRequests.state, "pending"),
            ne(schema.shiftRequests.id, live.id),
          ),
        );
    }
    return { req: live, cls } as const;
  });
  if ("error" in settled) return { ok: false, error: settled.error };
  const { req: liveReq, cls } = settled;

  const when =
    liveReq.scope === "standing"
      ? `Starting ${fmtDateLong(liveReq.occurrenceDate)}, every ${DAYS[cls.dayOfWeek]} at ${fmtTime(cls.startTime)}`
      : `${fmtDateLong(liveReq.occurrenceDate)}, ${fmtTime(cls.startTime)}`;
  // The asker hears either way. A declined ask that says nothing is how
  // somebody turns up to a class that was never theirs.
  await addNotification(liveReq.toUserId, {
    type: approve ? "shift_assigned" : "shift_declined",
    title: approve
      ? liveReq.scope === "standing"
        ? `You're the regular coach for ${cls.name}`
        : `You're on ${cls.name}`
      : `${cls.name} stayed where it was`,
    body: approve
      ? `${when} at ${studio.name}. The studio said yes.`
      : `${when} at ${studio.name}. The studio didn't approve the change.`,
    href: `/s/${studio.slug ?? studio.id}/${cls.id}?d=${liveReq.occurrenceDate}`,
    actorUserId: userId,
  });
  // A transfer has somebody on the other end of it who also arranged this.
  if (liveReq.fromUserId && liveReq.fromUserId !== liveReq.toUserId) {
    await addNotification(liveReq.fromUserId, {
      type: approve ? "shift_assigned" : "shift_declined",
      title: approve
        ? liveReq.scope === "standing"
          ? `${cls.name} has a new regular coach`
          : `${cls.name} is covered`
        : `${cls.name} is still yours`,
      body: approve
        ? `${when} at ${studio.name}. The studio approved the hand-over.`
        : `${when} at ${studio.name}. The studio didn't approve it.`,
      href: `/s/${studio.slug ?? studio.id}/${cls.id}?d=${liveReq.occurrenceDate}`,
      actorUserId: userId,
    });
  }
  revalidatePath("/app");
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  revalidatePath(`/s/${studio.slug ?? studio.id}/manage`);
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
  /** The viewer owns the standing weekly slot, rather than covering a date. */
  regularMine: boolean;
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
        regularMine: r.coachUserId === userId,
        onName: onUserId ? (nameOf.get(onUserId) ?? null) : null,
        pending: ask
          ? ask.kind === "pickup"
            ? `${nameOf.get(ask.toUserId) ?? "A coach"} asked for this one`
            : ask.scope === "standing"
              ? `Regular shift offered to ${nameOf.get(ask.toUserId) ?? "a coach"}`
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
 * It exists so "Your studios" and the staff screen answer the same private
 * staffing question. Public Places I coach and old class authorship are
 * directory facts, not permission to open a studio's operational tools.
 */
export async function myStaffStudios(): Promise<
  { id: string; name: string; slug: string; admin: boolean; photo: string | null }[]
> {
  const userId = await getSessionUserId();
  if (!userId) return [];
  const db = await getDb();
  const [rostered, managed] = await Promise.all([
    db
      .select({ studioId: schema.studioRotaCoaches.studioId })
      .from(schema.studioRotaCoaches)
      .where(
        and(
          eq(schema.studioRotaCoaches.userId, userId),
          eq(schema.studioRotaCoaches.role, "coach"),
          eq(schema.studioRotaCoaches.onSchedule, true),
          inArray(schema.studioRotaCoaches.state, INTERACTIVE_ROSTER_STATES),
        ),
      ),
    db
      .select({ studioId: schema.studioManagers.studioId })
      .from(schema.studioManagers)
      .where(eq(schema.studioManagers.userId, userId)),
  ]);
  const runs = new Set(managed.map((r) => r.studioId));
  const ids = [
    ...new Set(
      [...rostered, ...managed]
        .map((r) => r.studioId)
        .filter((id): id is string => !!id),
    ),
  ];
  if (!ids.length) return [];
  const rows = await db
    .select({
      id: schema.studios.id,
      name: schema.studios.name,
      slug: schema.studios.slug,
      photo: schema.studios.photo,
    })
    .from(schema.studios)
    .where(inArray(schema.studios.id, ids));
  return rows
    .map((s) => ({ id: s.id, name: s.name, slug: s.slug ?? s.id, admin: runs.has(s.id), photo: s.photo }))
    // The places you run first: they carry the work that only you can do.
    .sort((a, b) => Number(b.admin) - Number(a.admin) || a.name.localeCompare(b.name));
}
