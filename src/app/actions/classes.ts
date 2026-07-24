"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import type { BookingLink } from "@/db/schema";
import { getSessionUserId } from "@/lib/session";
import { LINK_LABELS } from "@/lib/format";
import { notifyScheduleChange } from "@/lib/notifier";

export type PublishInput = {
  name: string;
  days: number[]; // 0 = Monday … 6 = Sunday
  startTime: string; // "HH:MM"
  durationMin: number;
  studioId: string;
  links: BookingLink[];
};

function cleanLinks(links: BookingLink[]): BookingLink[] {
  return links
    .filter((l) => l.url.trim())
    .map((l) => ({
      label: LINK_LABELS.includes(l.label) ? l.label : "Other",
      url: l.url.trim(),
    }));
}

export async function publishClasses(
  input: PublishInput,
): Promise<{ ok: boolean; count?: number; notified?: number; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };

  const name = input.name.trim() || "New class";
  const days = [...new Set(input.days)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (!days.length) return { ok: false, error: "Pick at least one day." };
  if (!/^\d{2}:\d{2}$/.test(input.startTime)) return { ok: false, error: "Invalid start time." };
  const durationMin = Math.round(input.durationMin);
  if (!(durationMin > 0 && durationMin <= 24 * 60)) return { ok: false, error: "Invalid length." };

  const db = await getDb();
  const [studio] = await db.select().from(schema.studios).where(eq(schema.studios.id, input.studioId));
  if (!studio) return { ok: false, error: "Pick a studio." };
  const links = cleanLinks(input.links ?? []);

  // Templates track latest: publishing upserts the saved class with the
  // values used, so autofill always reflects the most recent version.
  const [template] = await db
    .insert(schema.classTemplates)
    .values({ userId, name, startTime: input.startTime, durationMin, studioId: studio.id, links })
    .onConflictDoUpdate({
      target: [schema.classTemplates.userId, schema.classTemplates.name],
      set: { startTime: input.startTime, durationMin, studioId: studio.id, links, updatedAt: new Date() },
    })
    .returning();

  await db.insert(schema.classes).values(
    days.map((dayOfWeek) => ({
      userId,
      templateId: template.id,
      dayOfWeek,
      startTime: input.startTime,
      durationMin,
      name,
      studioId: studio.id,
      links,
    })),
  );

  // One publish, many days -> one notification, never one per class row.
  let notified = 0;
  try {
    notified = await notifyScheduleChange(userId, {
      verb: "added",
      className: name,
      days,
      startTime: input.startTime,
      studioName: studio.name,
    });
  } catch (err) {
    console.error("schedule-change notify failed", err);
  }

  revalidatePath("/app");
  return { ok: true, count: days.length, notified };
}

export async function deleteClass(
  classId: string,
): Promise<{ ok: boolean; notified?: number; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const db = await getDb();
  const [row] = await db
    .select({
      id: schema.classes.id,
      name: schema.classes.name,
      dayOfWeek: schema.classes.dayOfWeek,
      startTime: schema.classes.startTime,
      studioName: schema.studios.name,
    })
    .from(schema.classes)
    .innerJoin(schema.studios, eq(schema.classes.studioId, schema.studios.id))
    .where(and(eq(schema.classes.id, classId), eq(schema.classes.userId, userId)));
  if (!row) return { ok: true, notified: 0 };

  await db.delete(schema.classes).where(eq(schema.classes.id, row.id));

  let notified = 0;
  try {
    notified = await notifyScheduleChange(userId, {
      verb: "removed",
      className: row.name,
      days: [row.dayOfWeek],
      startTime: row.startTime,
      studioName: row.studioName,
    });
  } catch (err) {
    console.error("schedule-change notify failed", err);
  }

  revalidatePath("/app");
  return { ok: true, notified };
}
