"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

// Phase 1 stores the subscriber only. Phase 2 adds the welcome email and
// schedule-change notifications on top of this.
export async function subscribe(
  handle: string,
  emailRaw: string,
): Promise<{ ok: boolean; error?: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "That doesn't look like an email address." };
  }
  const db = await getDb();
  const [trainer] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!trainer) return { ok: false, error: "Page not found." };
  await db
    .insert(schema.subscribers)
    .values({ trainerUserId: trainer.id, email })
    .onConflictDoUpdate({
      target: [schema.subscribers.trainerUserId, schema.subscribers.email],
      set: { optedOutAt: null },
    });
  return { ok: true };
}
