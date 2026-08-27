"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getDb, schema } from "@/db";
import { emailFeedback } from "@/lib/inquiry";
import { feedbackHost } from "@/lib/feedback";
import { addNotification } from "@/lib/notify";
import { getSessionUserId } from "@/lib/session";
import { objectionableContentError } from "@/lib/content-safety";
import { hiddenFrom } from "@/lib/blocks";
import {
  ANONYMOUS_ACTION_RETRY_ERROR,
  takeAnonymousActionRateLimit,
  type AnonymousActionRateLimits,
} from "@/lib/anonymous-rate-limit";
import { requestIpAddress } from "@/lib/request-ip";

// Feedback is a conversation, not a form.
//
// A form gets you one paragraph and no way to ask "which class did that
// happen on?". This opens a thread with whoever runs the app, in the app,
// on the same machinery as a coach's private-session inbox. One thread per
// person: everything you ever write stays in one place, both directions.

export type FeedbackThread = {
  hostName: string;
  messages: { id: string; fromCoach: boolean; body: string; createdAt: Date }[];
};

const FEEDBACK_MESSAGE_LIMITS: AnonymousActionRateLimits = {
  ip: { max: 20, windowMs: 60 * 60 * 1000 },
  ipTarget: { max: 10, windowMs: 60 * 60 * 1000 },
  subjectTarget: { max: 6, windowMs: 60 * 60 * 1000 },
  target: { max: 60, windowMs: 60 * 60 * 1000 },
};

export async function sendFeedback(bodyRaw: string): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const body = bodyRaw.trim().slice(0, 2000);
  if (body.length < 2) return { ok: false, error: "Write a short message." };
  const safetyError = objectionableContentError(body);
  if (safetyError) return { ok: false, error: safetyError };

  const host = await feedbackHost();
  if (!host) return { ok: false, error: "Feedback isn't set up yet." };
  if ((await hiddenFrom(userId)).has(host.id)) return { ok: false, error: "Feedback isn't available." };

  const db = await getDb();
  const [me] = await db
    .select({ name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me) return { ok: false, error: "Session expired." };
  if (me.email.toLowerCase() === host.email.toLowerCase()) {
    return { ok: false, error: "That would just be you, writing to you." };
  }

  const [closedThread] = await db
    .select({ coachClosedAt: schema.inquiryThreads.coachClosedAt })
    .from(schema.inquiryThreads)
    .where(and(
      eq(schema.inquiryThreads.coachUserId, host.id),
      eq(schema.inquiryThreads.requesterEmail, me.email),
      eq(schema.inquiryThreads.kind, "feedback"),
    ));
  if (closedThread?.coachClosedAt) return { ok: false, error: "Feedback isn't available." };

  let allowed = false;
  try {
    allowed = await takeAnonymousActionRateLimit(db, {
      action: "feedback_message",
      target: { kind: "feedback_host", id: host.id },
      subject: `user:${userId}`,
      ip: await requestIpAddress(),
      limits: FEEDBACK_MESSAGE_LIMITS,
    });
  } catch (error) {
    console.error("feedback rate limit failed", error);
  }
  if (!allowed) return { ok: false, error: ANONYMOUS_ACTION_RETRY_ERROR };

  const [thread] = await db
    .insert(schema.inquiryThreads)
    .values({
      coachUserId: host.id,
      kind: "feedback",
      requesterName: me.name,
      requesterEmail: me.email,
      coachUnread: 1,
    })
    .onConflictDoUpdate({
      target: [
        schema.inquiryThreads.coachUserId,
        schema.inquiryThreads.requesterEmail,
        schema.inquiryThreads.kind,
      ],
      set: {
        requesterName: me.name || sql`${schema.inquiryThreads.requesterName}`,
        coachUnread: sql`${schema.inquiryThreads.coachUnread} + 1`,
        lastMessageAt: new Date(),
      },
    })
    .returning();

  await db
    .insert(schema.inquiryMessages)
    .values({ threadId: thread.id, fromCoach: false, body });

  const who = me.name.trim() || me.email;
  await addNotification(host.id, {
    type: "feedback",
    title: `Feedback from ${who}`,
    body,
    href: `/inbox/${thread.id}`,
  });
  after(() =>
    emailFeedback({ to: host.email, from: who, body }).catch((err) =>
      console.error("feedback email failed", err),
    ),
  );

  revalidatePath("/feedback");
  return { ok: true };
}

// The prompt has been put in front of them. Recorded when it appears rather
// than when it's answered, so ignoring it counts as an answer and the app
// doesn't ask again on the next page load.
export async function markFeedbackPrompted(): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) return;
  const db = await getDb();
  await db
    .update(schema.users)
    .set({ feedbackPromptedAt: new Date() })
    .where(eq(schema.users.id, userId));
}

// The signed-in person's own feedback thread, if they've started one.
export async function myFeedback(): Promise<FeedbackThread | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const host = await feedbackHost();
  if (!host) return null;

  const db = await getDb();
  const [me] = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me) return null;

  const [thread] = await db
    .select({ id: schema.inquiryThreads.id })
    .from(schema.inquiryThreads)
    .where(
      and(
        eq(schema.inquiryThreads.coachUserId, host.id),
        eq(schema.inquiryThreads.requesterEmail, me.email),
        eq(schema.inquiryThreads.kind, "feedback"),
      ),
    );
  const hostName = host.name.trim() || "fittlist";
  if (!thread) return { hostName, messages: [] };

  const messages = await db
    .select()
    .from(schema.inquiryMessages)
    .where(eq(schema.inquiryMessages.threadId, thread.id))
    .orderBy(asc(schema.inquiryMessages.createdAt));
  return { hostName, messages };
}
