"use server";

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { sendWelcome } from "@/lib/notifier";
import { addNotification } from "@/lib/notify";

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
  // Drop a "someone followed you" note into the coach's activity feed. Best
  // effort — a feed hiccup should never fail the subscribe itself.
  try {
    // An email subscriber may still have an account under that address, and if
    // they do the coach should see their face rather than their email.
    const [account] = await db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.email, email));
    await addNotification(trainer.id, {
      type: "follow",
      title: "New follower",
      body: `${account?.name?.trim() || email} followed your schedule`,
      actorUserId: account?.id ?? null,
    });
  } catch (err) {
    console.error("follow notification failed", err);
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

// ---- account-based follows (the fan side). Same subscribers table, same
// digest pipeline — the row just carries the follower's userId.

export async function followTrainer(handle: string): Promise<{ ok: boolean; error?: string }> {
  const { getSessionUserId } = await import("@/lib/session");
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Log in first." };
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return { ok: false, error: "Log in first." };
  const [trainer] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!trainer) return { ok: false, error: "Page not found." };
  if (trainer.id === userId) return { ok: false, error: "That's your own page." };
  // Blocked people can't reach this page, but the action is a POST and the URL
  // is guessable, so the guard lives here too. Same wording as a page that
  // isn't there.
  const { isBlocked } = await import("@/lib/blocks");
  if (await isBlocked(trainer.id, userId)) return { ok: false, error: "Page not found." };

  const [existing] = await db
    .select()
    .from(schema.subscribers)
    .where(
      and(eq(schema.subscribers.trainerUserId, trainer.id), eq(schema.subscribers.email, me.email)),
    );
  const isNew = !existing || !!existing.optedOutAt;
  const [row] = await db
    .insert(schema.subscribers)
    .values({ trainerUserId: trainer.id, email: me.email, userId })
    .onConflictDoUpdate({
      target: [schema.subscribers.trainerUserId, schema.subscribers.email],
      set: { optedOutAt: null, userId },
    })
    .returning();

  if (isNew) {
    try {
      await sendWelcome(trainer, row);
    } catch (err) {
      console.error("welcome email failed", err);
    }
    try {
      await addNotification(trainer.id, {
        type: "follow",
        title: "New follower",
        body: `${me.name.trim() || me.email} followed your schedule`,
        actorUserId: me.id,
      });
    } catch (err) {
      console.error("follow notification failed", err);
    }
  }
  return { ok: true };
}

export async function unfollowTrainer(handle: string): Promise<{ ok: boolean; error?: string }> {
  const { getSessionUserId } = await import("@/lib/session");
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Log in first." };
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  const [trainer] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!me || !trainer) return { ok: false, error: "Page not found." };
  await db
    .update(schema.subscribers)
    .set({ optedOutAt: new Date() })
    .where(
      and(eq(schema.subscribers.trainerUserId, trainer.id), eq(schema.subscribers.email, me.email)),
    );
  return { ok: true };
}
