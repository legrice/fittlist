"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";

// "I'm going" is a personal note, not a reservation — nothing here talks to a
// studio's booking system, and the copy around it must never imply it does.
// The date matters: classes recur, so this marks one Tuesday, not every one.
export async function setGoing(
  classId: string,
  occurrenceDate: string,
  on: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Log in first." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) return { ok: false, error: "Bad date." };
  const db = await getDb();
  const [cls] = await db.select().from(schema.classes).where(eq(schema.classes.id, classId));
  if (!cls || !cls.isPublic) return { ok: false, error: "Class not found." };

  if (on) {
    await db
      .insert(schema.attendances)
      .values({ userId, classId, occurrenceDate })
      .onConflictDoNothing({
        target: [
          schema.attendances.userId,
          schema.attendances.classId,
          schema.attendances.occurrenceDate,
        ],
      });
  } else {
    await db
      .delete(schema.attendances)
      .where(
        and(
          eq(schema.attendances.userId, userId),
          eq(schema.attendances.classId, classId),
          eq(schema.attendances.occurrenceDate, occurrenceDate),
        ),
      );
  }
  revalidatePath("/feed");
  revalidatePath("/app");
  return { ok: true };
}
