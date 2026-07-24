"use server";

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { sendWelcome } from "@/lib/notifier";

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

  const [existing] = await db
    .select()
    .from(schema.subscribers)
    .where(
      and(eq(schema.subscribers.trainerUserId, trainer.id), eq(schema.subscribers.email, email)),
    );
  // Already on the list and active: nothing to do, no duplicate welcome.
  if (existing && !existing.optedOutAt) return { ok: true };

  const [row] = await db
    .insert(schema.subscribers)
    .values({ trainerUserId: trainer.id, email })
    .onConflictDoUpdate({
      target: [schema.subscribers.trainerUserId, schema.subscribers.email],
      set: { optedOutAt: null },
    })
    .returning();

  try {
    await sendWelcome(trainer, row);
  } catch (err) {
    console.error("welcome email failed", err);
  }
  return { ok: true };
}

// In-page opt-out for the session where the fan just subscribed. Equivalent
// in power to the unsubscribe link every email carries.
export async function unsubscribeEmail(
  handle: string,
  emailRaw: string,
): Promise<{ ok: boolean; error?: string }> {
  const email = emailRaw.trim().toLowerCase();
  const db = await getDb();
  const [trainer] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!trainer) return { ok: false, error: "Page not found." };
  await db
    .update(schema.subscribers)
    .set({ optedOutAt: new Date() })
    .where(
      and(eq(schema.subscribers.trainerUserId, trainer.id), eq(schema.subscribers.email, email)),
    );
  return { ok: true };
}
