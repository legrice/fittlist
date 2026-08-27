"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { syncUserToGoogle } from "@/lib/gcal";
import { isValidTimeZone } from "@/lib/timezone";

/** Change the clock for schedule items that belong to the person rather than
 * a place. Studio classes retain the studio's clock. */
export async function updateAccountTimeZone(
  raw: string,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  if (!isValidTimeZone(raw)) return { ok: false, error: "Choose a valid time zone." };
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.update(schema.users).set({ timeZone: raw }).where(eq(schema.users.id, userId));
    await tx
      .update(schema.classTemplates)
      .set({ timeZone: raw })
      .where(and(eq(schema.classTemplates.userId, userId), isNull(schema.classTemplates.studioId)));
    await tx
      .update(schema.classes)
      .set({ timeZone: raw })
      .where(and(eq(schema.classes.userId, userId), isNull(schema.classes.studioId)));
    await tx
      .update(schema.personalClasses)
      .set({ timeZone: raw })
      .where(and(eq(schema.personalClasses.userId, userId), isNull(schema.personalClasses.studioId)));
  });
  after(() => syncUserToGoogle(userId).catch((error) => console.error("gcal timezone sync failed", error)));
  revalidatePath("/calendar");
  revalidatePath("/feed");
  return { ok: true };
}
