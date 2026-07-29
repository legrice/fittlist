"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { isBlocked } from "@/lib/blocks";
import { occurrenceEnded } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";

// Adding a class is a personal note, not a reservation. Nothing here talks to
// a studio's booking system, and the copy around it must never imply it does.
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
  // Your own classes show up on your Home alongside the ones you follow, so
  // this is reachable — you teach it, you're not attending it.
  if (cls.userId === userId)
    return { ok: false, error: "You aren’t able to attend your own class." };
  // A coach who blocked you has no schedule as far as you're concerned, so
  // there's nothing here to add. Same wording as a class that isn't there.
  if (await isBlocked(cls.userId, userId)) return { ok: false, error: "Class not found." };
  // Adding is only ever forward. Taking one back out stays allowed whatever the
  // date: removing something you didn't get to isn't a thing to be stopped from
  // doing, and the list clears itself as the week passes anyway.
  if (on && occurrenceEnded(occurrenceDate, cls.startTime, cls.durationMin)) {
    return { ok: false, error: "That class has already started." };
  }

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
