"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";

// A member's own standing class. Private by construction: nothing here can
// make one public, so this whole file is allowed to be simple.

const MAX_ENTRIES = 30; // a week has room for a lot of training, not for a spreadsheet

export async function addPersonalClass(input: {
  name: string;
  dayOfWeek: number;
  startTime: string;
  durationMin: number;
  location?: string;
  withWho?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Log in first." };
  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false, error: "Give it a name." };
  if (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 0 || input.dayOfWeek > 6)
    return { ok: false, error: "Pick a day." };
  if (!/^\d{2}:\d{2}$/.test(input.startTime)) return { ok: false, error: "Pick a time." };
  const durationMin = Math.round(input.durationMin);
  if (!(durationMin > 0 && durationMin <= 24 * 60)) return { ok: false, error: "Invalid length." };

  const db = await getDb();
  const mine = await db
    .select({ id: schema.personalClasses.id })
    .from(schema.personalClasses)
    .where(eq(schema.personalClasses.userId, userId));
  if (mine.length >= MAX_ENTRIES) return { ok: false, error: "That's plenty for one week." };

  await db.insert(schema.personalClasses).values({
    userId,
    name,
    dayOfWeek: input.dayOfWeek,
    startTime: input.startTime,
    durationMin,
    location: input.location?.trim().slice(0, 120) ?? "",
    withWho: input.withWho?.trim().slice(0, 80) ?? "",
  });
  revalidatePath("/week");
  return { ok: true };
}

export async function removePersonalClass(id: string): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Log in first." };
  const db = await getDb();
  await db
    .delete(schema.personalClasses)
    .where(and(eq(schema.personalClasses.id, id), eq(schema.personalClasses.userId, userId)));
  revalidatePath("/week");
  return { ok: true };
}
