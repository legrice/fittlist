"use server";

import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";

/**
 * Mark a coach's circle as looked at.
 *
 * Called when the peek opens, not when it closes: opening is the act of
 * looking, and somebody who opens a coach and dismisses without saving has
 * still seen what was there. Clearing on close would leave the ring lit for
 * anyone who checked and decided not to go, which teaches people to ignore it.
 *
 * Session-derived and takes only the coach. It writes one row belonging to the
 * caller, so there is nothing here worth handing an id for.
 */
export async function markPeeked(coachUserId: string): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };
  const db = await getDb();
  const [me] = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me) return { ok: false };
  await db
    .update(schema.subscribers)
    .set({ peekedAt: new Date() })
    .where(
      and(
        eq(schema.subscribers.trainerUserId, coachUserId),
        eq(schema.subscribers.email, me.email),
        isNull(schema.subscribers.optedOutAt),
      ),
    );
  return { ok: true };
}
