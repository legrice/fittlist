"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { sendWelcome } from "@/lib/notifier";
import { addNotification } from "@/lib/notify";

// A follow changes what two screens hold, and neither of them is the one the
// tap happened on. Without this the router serves the copy of Following it
// already had, so the coach you just followed isn't on it: exactly the promise
// FollowHint makes when it links you straight there. The pill's own state is
// local, which is why the profile itself needs nothing.
const followChanged = () => {
  revalidatePath("/feed");
  revalidatePath("/following");
};

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
      .select({ id: schema.users.id, name: schema.users.name, handle: schema.users.handle })
      .from(schema.users)
      .where(eq(schema.users.email, email));
    await addNotification(trainer.id, {
      type: "follow",
      title: "New follower",
      body: `${account?.name?.trim() || email} followed your schedule`,
      // Tapping the notice opens who they are, so following back is one more tap.
      href: account?.handle ? `/${account.handle}` : null,
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

export async function followTrainer(
  handle: string,
): Promise<{ ok: boolean; error?: string; requested?: boolean }> {
  const { getSessionUserId } = await import("@/lib/session");
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return { ok: false, error: "Sign in first." };
  const [trainer] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!trainer) return { ok: false, error: "Page not found." };
  if (trainer.id === userId) return { ok: false, error: "That's your own page." };
  // Blocked people can't reach this page, but the action is a POST and the URL
  // is guessable, so the guard lives here too. Same wording as a page that
  // isn't there.
  const { isBlocked } = await import("@/lib/blocks");
  if (await isBlocked(trainer.id, userId)) return { ok: false, error: "Page not found." };

  // The private-account gate: a follow starts as a request they approve.
  // Only when there's no active follow already; re-following after an
  // unfollow goes through the gate like anyone else.
  if (trainer.approveFollowers) {
    const [active] = await db
      .select({ optedOutAt: schema.subscribers.optedOutAt })
      .from(schema.subscribers)
      .where(
        and(
          eq(schema.subscribers.trainerUserId, trainer.id),
          eq(schema.subscribers.email, me.email),
        ),
      );
    if (!active || active.optedOutAt) {
      const inserted = await db
        .insert(schema.followRequests)
        .values({ trainerUserId: trainer.id, requesterUserId: userId })
        .onConflictDoNothing()
        .returning({ id: schema.followRequests.id });
      if (inserted.length) {
        try {
          await addNotification(trainer.id, {
            type: "follow_request",
            title: `${me.name.trim() || me.email} asked to follow you`,
            body: "Approve or decline in Followers.",
            href: "/followers",
            actorUserId: userId,
          });
        } catch (err) {
          console.error("follow request notification failed", err);
        }
      }
      return { ok: true, requested: true };
    }
  }

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
    // No confirmation email. They tapped Follow in the app, on purpose, and
    // an inbox full of "you followed X" after picking six coaches on Discover
    // reads as noise about their own actions. The email-only subscribe path
    // keeps its welcome email: there it's the receipt, and it carries the
    // unsubscribe link that is that person's only control.
    try {
      await addNotification(trainer.id, {
        type: "follow",
        title: "New follower",
        // A member has no schedule to follow; the sentence has to fit both.
        body: `${me.name.trim() || me.email} followed ${trainer.kind === "fan" ? "you" : "your schedule"}`,
        // Tapping the notice opens who they are, so following back is one more tap.
        href: me.handle ? `/${me.handle}` : null,
        actorUserId: me.id,
      });
    } catch (err) {
      console.error("follow notification failed", err);
    }
  }
  followChanged();
  if (isNew) {
    const { recordProductActivity } = await import("@/lib/product-activity");
    await recordProductActivity(userId, "favorite_person_added");
  }
  return { ok: true };
}

export async function unfollowTrainer(handle: string): Promise<{ ok: boolean; error?: string }> {
  const { getSessionUserId } = await import("@/lib/session");
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
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
  // Tapping again on "Requested" is a cancel: the ask is withdrawn quietly.
  await db
    .delete(schema.followRequests)
    .where(
      and(
        eq(schema.followRequests.trainerUserId, trainer.id),
        eq(schema.followRequests.requesterUserId, userId),
      ),
    );
  // Following is the relationship that makes a person eligible for the
  // calendar rail. Do not leave an orphaned priority pin behind after an
  // unfollow, or they can appear to remain followed until another refresh.
  await db
    .delete(schema.calendarPins)
    .where(
      and(
        eq(schema.calendarPins.userId, userId),
        eq(schema.calendarPins.entityType, "person"),
        eq(schema.calendarPins.entityId, trainer.id),
      ),
    );
  followChanged();
  const { recordProductActivity } = await import("@/lib/product-activity");
  await recordProductActivity(userId, "favorite_person_removed");
  return { ok: true };
}

// ---- the approval side. Owner-only: the request has to be addressed to you.

export type PendingFollower = {
  id: string;
  name: string;
  photo: string | null;
  color: string;
  handle: string | null;
};

export async function listFollowRequests(): Promise<PendingFollower[]> {
  const { getSessionUserId } = await import("@/lib/session");
  const userId = await getSessionUserId();
  if (!userId) return [];
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.followRequests)
    .where(eq(schema.followRequests.trainerUserId, userId));
  if (!rows.length) return [];
  const { inArray } = await import("drizzle-orm");
  const people = await db
    .select()
    .from(schema.users)
    .where(inArray(schema.users.id, rows.map((r) => r.requesterUserId)));
  const byId = new Map(people.map((p) => [p.id, p]));
  const { avatarColor } = await import("@/lib/avatar");
  return rows
    .map((r) => {
      const p = byId.get(r.requesterUserId);
      if (!p) return null;
      return {
        id: r.id,
        name: p.name.trim() || p.email.split("@")[0],
        photo: p.photo,
        color: avatarColor(p),
        handle: p.handle,
      };
    })
    .filter((x): x is PendingFollower => !!x);
}

export async function answerFollowRequest(
  requestId: string,
  approve: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { getSessionUserId } = await import("@/lib/session");
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const db = await getDb();
  const [req] = await db
    .select()
    .from(schema.followRequests)
    .where(
      and(eq(schema.followRequests.id, requestId), eq(schema.followRequests.trainerUserId, userId)),
    );
  if (!req) return { ok: false, error: "That request is gone." };
  await db.delete(schema.followRequests).where(eq(schema.followRequests.id, requestId));
  // Declined: nothing else happens, and nothing says so. They can ask again;
  // a "declined" notice is an invitation to take it personally.
  if (!approve) return { ok: true };

  const [requester] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, req.requesterUserId));
  if (!requester) return { ok: true };
  await db
    .insert(schema.subscribers)
    .values({ trainerUserId: userId, email: requester.email, userId: requester.id })
    .onConflictDoUpdate({
      target: [schema.subscribers.trainerUserId, schema.subscribers.email],
      set: { optedOutAt: null, userId: requester.id },
    });
  const [me] = await db
    .select({ name: schema.users.name, email: schema.users.email, handle: schema.users.handle })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  try {
    await addNotification(requester.id, {
      type: "follow",
      title: `${me?.name?.trim() || me?.email || "They"} approved your follow`,
      body: "You follow each other's worlds now.",
      href: me?.handle ? `/${me.handle}` : null,
      actorUserId: userId,
    });
  } catch (err) {
    console.error("approval notification failed", err);
  }
  return { ok: true };
}
