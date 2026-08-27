"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import {
  ANONYMOUS_ACTION_RETRY_ERROR,
  takeAnonymousActionRateLimit,
  type AnonymousActionRateLimits,
} from "@/lib/anonymous-rate-limit";
import {
  clearPendingEmailFollowToken,
  emailFollowTokenHash,
  EMAIL_FOLLOW_TOKEN_RE,
  EMAIL_FOLLOW_TTL_MS,
  pendingEmailFollowToken,
} from "@/lib/email-follow";
import { sendFollowConfirmation, sendWelcome } from "@/lib/notifier";
import { addNotification } from "@/lib/notify";
import { hiddenFrom } from "@/lib/blocks";
import { requestIpAddress } from "@/lib/request-ip";
import { getSessionUserId } from "@/lib/session";

type PublicSubscribeResult = {
  ok: boolean;
  pending?: boolean;
  message?: string;
  error?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONFIRMATION_CLEANUP_BATCH = 100;

// A follow request is an email-sending primitive, so it gets the same four
// independent brakes as the public inquiry form. The subject+coach key keeps
// changing IP addresses from repeatedly targeting one mailbox; the aggregate
// coach key also limits a distributed campaign against one public profile.
const EMAIL_FOLLOW_REQUEST_LIMITS: AnonymousActionRateLimits = {
  ip: { max: 10, windowMs: 60 * 60 * 1000 },
  ipTarget: { max: 4, windowMs: 60 * 60 * 1000 },
  subjectTarget: { max: 3, windowMs: 60 * 60 * 1000 },
  target: { max: 30, windowMs: 60 * 60 * 1000 },
};

// The coach-scoped subject key above can be rotated by choosing other public
// profiles. This second, constant target caps one mailbox across every coach.
const EMAIL_FOLLOW_MAILBOX_LIMITS: AnonymousActionRateLimits = {
  subjectTarget: { max: 5, windowMs: 60 * 60 * 1000 },
};

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
): Promise<PublicSubscribeResult> {
  const email = emailRaw.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return { ok: false, error: "That doesn't look like an email address." };
  }
  const db = await getDb();
  const [trainer] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!trainer) return { ok: false, error: "Page not found." };

  let allowed = false;
  try {
    const ip = await requestIpAddress();
    const coachAllowed = await takeAnonymousActionRateLimit(db, {
      action: "email_follow_request",
      target: { kind: "coach", id: trainer.id },
      subject: email,
      ip,
      limits: EMAIL_FOLLOW_REQUEST_LIMITS,
    });
    if (coachAllowed) {
      allowed = await takeAnonymousActionRateLimit(db, {
        action: "email_follow_mailbox",
        target: { kind: "mailbox", id: "global" },
        subject: email,
        ip,
        limits: EMAIL_FOLLOW_MAILBOX_LIMITS,
      });
    }
  } catch (error) {
    // Fail closed: a broken limiter must not turn this public action into an
    // email-bombing relay. The response intentionally reveals no failed key.
    console.error("email follow request rate limit failed", error);
  }
  if (!allowed) return { ok: false, error: ANONYMOUS_ACTION_RETRY_ERROR };

  // Keep cleanup bounded so an attacker cannot make one public request delete
  // an unbounded number of old rows. Failure is harmless and must not hide a
  // confirmation email that can otherwise be delivered.
  try {
    const expired = await db
      .select({ id: schema.emailFollowConfirmations.id })
      .from(schema.emailFollowConfirmations)
      .where(lte(schema.emailFollowConfirmations.expiresAt, new Date()))
      .orderBy(schema.emailFollowConfirmations.expiresAt)
      .limit(CONFIRMATION_CLEANUP_BATCH);
    if (expired.length) {
      await db
        .delete(schema.emailFollowConfirmations)
        .where(inArray(schema.emailFollowConfirmations.id, expired.map((row) => row.id)));
    }
  } catch (error) {
    console.error("email follow confirmation cleanup failed", error);
  }

  const token = randomBytes(32).toString("hex");
  const [confirmation] = await db
    .insert(schema.emailFollowConfirmations)
    .values({
      trainerUserId: trainer.id,
      email,
      tokenHash: emailFollowTokenHash(token),
      expiresAt: new Date(Date.now() + EMAIL_FOLLOW_TTL_MS),
    })
    .returning({ id: schema.emailFollowConfirmations.id });

  let delivered = false;
  try {
    delivered = (await sendFollowConfirmation(trainer, email, token)).ok;
  } catch (error) {
    console.error("follow confirmation email failed", error);
  }
  if (!delivered) {
    // A token nobody received is useless. Removing it also prevents the UI
    // from claiming success when the configured provider rejected delivery.
    try {
      await db
        .delete(schema.emailFollowConfirmations)
        .where(eq(schema.emailFollowConfirmations.id, confirmation.id));
    } catch (error) {
      console.error("failed email follow confirmation cleanup failed", error);
    }
    return { ok: false, error: "We couldn't send that email. Please try again in a moment." };
  }
  // This is intentionally identical whether the email already has an account,
  // already follows, or is completely new. Nothing is attached, activated,
  // notified or scheduled for a digest until the mailbox owner confirms.
  return {
    ok: true,
    pending: true,
    message: "Check your email to confirm the follow.",
  };
}

type EmailFollowActivation = {
  trainer: { id: string; name: string; handle: string | null };
  subscriber: { id: string; email: string };
  account: { id: string; name: string; handle: string | null } | null;
  isNew: boolean;
};

type ConsumedEmailFollow = { activation: EmailFollowActivation | null };

function databaseErrorCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    if ("code" in current && typeof current.code === "string") return current.code;
    current = "cause" in current ? current.cause : null;
  }
  return null;
}

async function consumeEmailFollowToken(token: string): Promise<ConsumedEmailFollow | null> {
  if (!EMAIL_FOLLOW_TOKEN_RE.test(token)) return null;
  const db = await getDb();
  const tokenHash = emailFollowTokenHash(token);

  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(
        async (tx) => {
          const now = new Date();
          const [candidate] = await tx
            .select()
            .from(schema.emailFollowConfirmations)
            .where(
              and(
                eq(schema.emailFollowConfirmations.tokenHash, tokenHash),
                isNull(schema.emailFollowConfirmations.consumedAt),
                gt(schema.emailFollowConfirmations.expiresAt, now),
              ),
            )
            .limit(1);
          if (!candidate) return null;

          const [claimed] = await tx
            .update(schema.emailFollowConfirmations)
            .set({ consumedAt: now })
            .where(
              and(
                eq(schema.emailFollowConfirmations.id, candidate.id),
                isNull(schema.emailFollowConfirmations.consumedAt),
                gt(schema.emailFollowConfirmations.expiresAt, now),
              ),
            )
            .returning();
          if (!claimed) return null;

          // A fresh request can produce another valid email. Once one token is
          // accepted, invalidate its siblings in the same transaction so a
          // stale link cannot later reactivate a deliberately removed follow.
          await tx
            .update(schema.emailFollowConfirmations)
            .set({ consumedAt: now })
            .where(
              and(
                eq(schema.emailFollowConfirmations.trainerUserId, claimed.trainerUserId),
                eq(schema.emailFollowConfirmations.email, claimed.email),
                isNull(schema.emailFollowConfirmations.consumedAt),
              ),
            );

          const [trainer] = await tx
            .select({ id: schema.users.id, name: schema.users.name, handle: schema.users.handle })
            .from(schema.users)
            .where(eq(schema.users.id, claimed.trainerUserId));
          if (!trainer) return { activation: null };

          const [account] = await tx
            .select({ id: schema.users.id, name: schema.users.name, handle: schema.users.handle })
            .from(schema.users)
            .where(eq(schema.users.email, claimed.email));

          const [blocked] = account
            ? await tx
                .select({ id: schema.blocks.id })
                .from(schema.blocks)
                .where(
                  or(
                    and(
                      eq(schema.blocks.blockerUserId, account.id),
                      eq(schema.blocks.blockedUserId, trainer.id),
                    ),
                    and(
                      eq(schema.blocks.blockerUserId, trainer.id),
                      eq(schema.blocks.blockedUserId, account.id),
                    ),
                  ),
                )
                .limit(1)
            : [];

          // Do not recreate a relationship a block removed, and do not bring
          // back the historical self-follow shape. The success page stays
          // generic so neither outcome discloses whether this address has an
          // account or whether either account blocked the other.
          if (account?.id === trainer.id || blocked) return { activation: null };

          const [existing] = await tx
            .select({ optedOutAt: schema.subscribers.optedOutAt })
            .from(schema.subscribers)
            .where(
              and(
                eq(schema.subscribers.trainerUserId, trainer.id),
                eq(schema.subscribers.email, claimed.email),
              ),
            );
          // A token requested before an explicit unsubscribe must not be able
          // to revive the relationship afterward. A request made after that
          // opt-out is a fresh double opt-in and may reactivate it.
          if (existing?.optedOutAt && existing.optedOutAt >= claimed.createdAt) {
            return { activation: null };
          }
          const isNew = !existing || !!existing.optedOutAt;
          const [subscriber] = await tx
            .insert(schema.subscribers)
            .values({
              trainerUserId: trainer.id,
              email: claimed.email,
              userId: account?.id ?? null,
            })
            .onConflictDoUpdate({
              target: [schema.subscribers.trainerUserId, schema.subscribers.email],
              set: { optedOutAt: null, userId: account?.id ?? null },
            })
            .returning({ id: schema.subscribers.id, email: schema.subscribers.email });
          if (!subscriber) throw new Error("Email follow activation did not return a subscriber");
          return { activation: { trainer, subscriber, account: account ?? null, isNew } };
        },
        { isolationLevel: "serializable" },
      );
    } catch (error) {
      const retryable = databaseErrorCode(error) === "40001" || databaseErrorCode(error) === "40P01";
      if (!retryable || attempt >= 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
}

/** The email GET only parks its token. This explicit POST atomically consumes
 * it and activates the subscriber before any welcome mail or coach notice is
 * allowed to leave the process. */
export async function confirmEmailFollow(): Promise<void> {
  const token = await pendingEmailFollowToken();
  if (!token) redirect("/follow/continue");

  let consumed: ConsumedEmailFollow | null = null;
  let failed = false;
  try {
    consumed = await consumeEmailFollowToken(token);
  } catch (error) {
    failed = true;
    console.error("email follow confirmation failed", error);
  }
  if (failed) redirect("/follow/continue?retry=1");
  if (!consumed) {
    await clearPendingEmailFollowToken();
    redirect("/follow/continue");
  }

  await clearPendingEmailFollowToken();
  const activated = consumed.activation;
  if (activated) {
    followChanged();
    if (activated.isNew) {
      // The transaction has committed before either external side effect is
      // scheduled. Each is best-effort and cannot roll relational state back.
      after(async () => {
        try {
          await sendWelcome(activated.trainer, activated.subscriber);
        } catch (error) {
          console.error("welcome email failed", error);
        }
        try {
          await addNotification(activated.trainer.id, {
            type: "follow",
            title: "New follower",
            body: `${activated.account?.name.trim() || activated.subscriber.email} followed your schedule`,
            href: activated.account?.handle ? `/${activated.account.handle}` : null,
            actorUserId: activated.account?.id ?? null,
          });
        } catch (error) {
          console.error("follow notification failed", error);
        }
      });
    }
  }
  redirect("/follow/continue?confirmed=1");
}

// A session may only opt out the address owned by that session. Email messages
// also carry a signed, subscriber-specific unsubscribe URL; a bare address is
// never authority to mutate a row.
export async function unsubscribeEmail(
  handle: string,
  _emailRaw: string,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) {
    return { ok: false, error: "Sign in or use the unsubscribe link in your email." };
  }
  const db = await getDb();
  const [me] = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me) return { ok: false, error: "Sign in or use the unsubscribe link in your email." };
  const [trainer] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!trainer) return { ok: false, error: "Page not found." };
  await db
    .update(schema.subscribers)
    .set({ optedOutAt: new Date() })
    .where(
      and(eq(schema.subscribers.trainerUserId, trainer.id), eq(schema.subscribers.email, me.email)),
    );
  followChanged();
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
  if ((await hiddenFrom(userId)).has(trainer.id)) return { ok: false, error: "Page not found." };

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
  const hidden = await hiddenFrom(userId);
  const { avatarColor } = await import("@/lib/avatar");
  return rows
    .map((r) => {
      const p = byId.get(r.requesterUserId);
      if (!p || hidden.has(p.id)) return null;
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
  if ((await hiddenFrom(userId)).has(req.requesterUserId)) {
    return { ok: false, error: "That request is gone." };
  }

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
