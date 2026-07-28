"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getDb, schema } from "@/db";
import type { BookingLink } from "@/db/schema";
import { getSessionUserId } from "@/lib/session";
import { detectProvider, dowOfDate } from "@/lib/format";
import { syncUserToGoogle } from "@/lib/gcal";

// Mirror the schedule to Google after the response is sent, so publishing stays
// snappy. No-ops unless the trainer connected Google.
function syncGoogleAfter(userId: string) {
  after(() => syncUserToGoogle(userId).catch((err) => console.error("gcal sync failed", err)));
}

export type PublishInput = {
  name: string;
  classType?: string | null;
  description?: string | null;
  days: number[]; // 0 = Monday … 6 = Sunday
  // set = a one-off pinned to this ISO date; null/absent = standing weekly on `days`.
  specificDate?: string | null;
  endsOn?: string | null; // weekly only: last date it runs
  startTime: string; // "HH:MM"
  durationMin: number;
  studioId?: string | null; // required for public; optional for private
  location?: string | null; // free-form place for private items with no studio
  isPublic?: boolean; // default true
  links: BookingLink[];
};

// Types come from a controlled dropdown (curated + coach-added), so just trim
// and cap; an empty value clears the type.
function cleanType(t: string | null | undefined): string | null {
  const v = (t ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
  return v || null;
}

// The classes already logged at a studio, by any coach — powers the studio-first
// picker so a coach reuses an existing class (with its type + description).
export async function getStudioCatalog(
  studioId: string,
): Promise<{ name: string; classType: string | null; description: string | null }[]> {
  const userId = await getSessionUserId();
  if (!userId) return [];
  const db = await getDb();
  return db
    .select({
      name: schema.studioClasses.name,
      classType: schema.studioClasses.classType,
      description: schema.studioClasses.description,
    })
    .from(schema.studioClasses)
    .where(eq(schema.studioClasses.studioId, studioId))
    .orderBy(schema.studioClasses.name);
}

// Add a coach-defined class type to the shared list; returns the stored name.
export async function addClassType(
  nameRaw: string,
): Promise<{ ok: boolean; name?: string; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const name = nameRaw.trim().replace(/\s+/g, " ").slice(0, 30);
  if (name.length < 2) return { ok: false, error: "Type a longer name." };
  const db = await getDb();
  await db
    .insert(schema.customClassTypes)
    .values({ name, nameKey: name.toLowerCase(), createdByUserId: userId })
    .onConflictDoNothing({ target: schema.customClassTypes.nameKey });
  return { ok: true, name };
}

function cleanLinks(links: BookingLink[]): BookingLink[] {
  // The label is derived from the URL server-side, so it's always correct
  // regardless of what the client sent.
  return links
    .filter((l) => l.url.trim())
    .map((l) => ({ label: detectProvider(l.url), url: l.url.trim() }));
}

type SaveResult = { ok: boolean; count?: number; error?: string };

// Shared by publish (new rows) and edit (replaceClassId set: the original
// row is swapped for rows on the selected days).
async function save(userId: string, input: PublishInput, replaceClassId?: string): Promise<SaveResult> {
  const name = input.name.trim() || "New class";
  // A one-off is authoritative on its date: the weekday comes from the date,
  // not the day pills. Weekly classes fan out across the selected days.
  const oneOff = input.specificDate?.trim() || null;
  if (oneOff && !/^\d{4}-\d{2}-\d{2}$/.test(oneOff)) return { ok: false, error: "Invalid date." };
  // A one-off is its own date, so an end date only means something weekly.
  const endsOn = oneOff ? null : input.endsOn?.trim() || null;
  if (endsOn && !/^\d{4}-\d{2}-\d{2}$/.test(endsOn))
    return { ok: false, error: "Invalid end date." };
  if (endsOn && endsOn < new Date().toISOString().slice(0, 10))
    return { ok: false, error: "That end date has already passed." };
  const days = oneOff
    ? [dowOfDate(oneOff)]
    : [...new Set(input.days)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (!days.length) return { ok: false, error: oneOff ? "Pick a date." : "Pick at least one day." };
  if (!/^\d{2}:\d{2}$/.test(input.startTime)) return { ok: false, error: "Invalid start time." };
  const durationMin = Math.round(input.durationMin);
  if (!(durationMin > 0 && durationMin <= 24 * 60)) return { ok: false, error: "Invalid length." };

  const db = await getDb();
  const isPublic = input.isPublic !== false; // default public
  let studio: typeof schema.studios.$inferSelect | undefined;
  if (input.studioId) {
    [studio] = await db.select().from(schema.studios).where(eq(schema.studios.id, input.studioId));
    if (!studio) return { ok: false, error: "Pick a studio." };
  }
  // Public classes must have a studio; private ones can skip it and use a
  // free-form location instead.
  if (isPublic && !studio) return { ok: false, error: "Pick a studio." };
  const studioId = studio?.id ?? null;
  const location = studioId ? null : input.location?.trim().slice(0, 120) || null;
  const links = cleanLinks(input.links ?? []);
  const classType = cleanType(input.classType);
  const description = input.description?.trim().slice(0, 500) || null;

  if (replaceClassId) {
    const [existing] = await db
      .select({
        id: schema.classes.id,
        templateId: schema.classes.templateId,
        specificDate: schema.classes.specificDate,
      })
      .from(schema.classes)
      .where(and(eq(schema.classes.id, replaceClassId), eq(schema.classes.userId, userId)));
    if (!existing) return { ok: false, error: "Class not found." };
    if (!existing.specificDate && existing.templateId) {
      // Editing a weekly class replaces its whole recurring set (all its
      // weekly rows), so the selected days become the new set - one-off dated
      // instances of the same class are left untouched.
      await db
        .delete(schema.classes)
        .where(
          and(
            eq(schema.classes.userId, userId),
            eq(schema.classes.templateId, existing.templateId),
            isNull(schema.classes.specificDate),
          ),
        );
    } else {
      await db.delete(schema.classes).where(eq(schema.classes.id, existing.id));
    }
  }

  // Templates track latest: publishing upserts the saved class with the
  // values used, so autofill always reflects the most recent version.
  const [template] = await db
    .insert(schema.classTemplates)
    .values({ userId, name, classType, description, startTime: input.startTime, durationMin, studioId, location, isPublic, links })
    .onConflictDoUpdate({
      target: [schema.classTemplates.userId, schema.classTemplates.name],
      set: { classType, description, startTime: input.startTime, durationMin, studioId, location, isPublic, links, updatedAt: new Date() },
    })
    .returning();

  await db.insert(schema.classes).values(
    days.map((dayOfWeek) => ({
      userId,
      templateId: template.id,
      dayOfWeek,
      specificDate: oneOff,
      endsOn,
      startTime: input.startTime,
      durationMin,
      name,
      classType,
      description,
      studioId,
      location,
      isPublic,
      links,
    })),
  );

  // Log this class into the shared per-studio catalog (deduped by studio +
  // normalized name). Public + studio only: private sessions must never leak
  // into the cross-coach catalog.
  if (isPublic && studio) {
    try {
      await db
        .insert(schema.studioClasses)
        .values({
          studioId: studio.id,
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

  // Subscribers get the schedule as one weekly digest (see sendWeeklyDigests),
  // not a per-change email, so publishing just updates the page + Google sync.
  syncGoogleAfter(userId);
  revalidatePath("/app");
  return { ok: true, count: days.length };
}

export async function publishClasses(input: PublishInput): Promise<SaveResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  return save(userId, input);
}

export async function updateClass(classId: string, input: PublishInput): Promise<SaveResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  return save(userId, input, classId);
}

// A repeating class is one row per weekday sharing a template, so deleting is
// two different intentions: drop the day you opened, or drop the whole set.
// "all" mirrors what editing already does — the recurring rows go, one-off
// dated instances of the same class stay.
export async function deleteClass(
  classId: string,
  scope: "one" | "all" = "one",
): Promise<{ ok: boolean; error?: string; count?: number }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const db = await getDb();
  const [row] = await db
    .select({
      id: schema.classes.id,
      templateId: schema.classes.templateId,
      specificDate: schema.classes.specificDate,
    })
    .from(schema.classes)
    .where(and(eq(schema.classes.id, classId), eq(schema.classes.userId, userId)));
  if (!row) return { ok: true, count: 0 };

  let count = 1;
  if (scope === "all" && !row.specificDate && row.templateId) {
    const gone = await db
      .delete(schema.classes)
      .where(
        and(
          eq(schema.classes.userId, userId),
          eq(schema.classes.templateId, row.templateId),
          isNull(schema.classes.specificDate),
        ),
      )
      .returning({ id: schema.classes.id });
    count = gone.length;
  } else {
    await db.delete(schema.classes).where(eq(schema.classes.id, row.id));
  }

  syncGoogleAfter(userId);
  revalidatePath("/app");
  return { ok: true, count };
}
