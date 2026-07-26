"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";

// Replace the coach's "I work here" studio set with the given ids (validated
// against the shared directory). Used by the setup wizard's studios step.
export async function setCoachStudios(
  studioIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const ids = [...new Set(studioIds.filter(Boolean))].slice(0, 60);
  const db = await getDb();
  const valid = ids.length
    ? (
        await db
          .select({ id: schema.studios.id })
          .from(schema.studios)
          .where(inArray(schema.studios.id, ids))
      ).map((r) => r.id)
    : [];

  await db.delete(schema.coachStudios).where(eq(schema.coachStudios.userId, userId));
  if (valid.length) {
    await db.insert(schema.coachStudios).values(valid.map((studioId) => ({ userId, studioId })));
  }

  const [u] = await db
    .select({ handle: schema.users.handle })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  revalidatePath("/app");
  if (u?.handle) revalidatePath(`/${u.handle}`);
  return { ok: true };
}

// Mark the setup wizard done, so the app stops redirecting into /welcome.
export async function completeOnboarding(): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };
  const db = await getDb();
  await db
    .update(schema.users)
    .set({ onboardedAt: new Date() })
    .where(eq(schema.users.id, userId));
  return { ok: true };
}
