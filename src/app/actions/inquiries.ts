"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getDb, schema } from "@/db";
import { isBlocked } from "@/lib/blocks";
import { addNotification } from "@/lib/notify";
import { getSessionUserId } from "@/lib/session";
import {
  emailCoachInquiry,
  emailFeedbackReply,
  emailRequesterReply,
  inquiryToken,
  verifyInquiryToken,
} from "@/lib/inquiry";

type Result = { ok: boolean; error?: string };

// PUBLIC — a visitor's "Request private session". Upserts one thread per
// (coach, email) so repeat messages continue the same conversation.
export async function sendInquiry(
  handle: string,
  nameRaw: string,
  emailRaw: string,
  messageRaw: string,
  phoneRaw = "",
): Promise<Result> {
  const message = messageRaw.trim().slice(0, 2000);
  const phone = phoneRaw.trim().slice(0, 40);
  if (message.length < 2) return { ok: false, error: "Write a short message." };

  const db = await getDb();
  // Somebody signed in is not a stranger, so the composer asks them for the
  // message and nothing else. Their name and email come from the account here
  // rather than from the form, which is what makes the fields safe to drop: a
  // client that sent its own would be sending something we already know
  // better. A visitor still fills them in, because a coach's reply has to
  // reach somebody.
  const viewerId = await getSessionUserId();
  const viewer = viewerId
    ? (await db.select().from(schema.users).where(eq(schema.users.id, viewerId)))[0]
    : undefined;
  const email = (viewer?.email ?? emailRaw).trim().toLowerCase();
  const name = (viewer?.name ?? nameRaw).trim().slice(0, 80);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email." };

  const [coach] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!coach) return { ok: false, error: "Page not found." };
  // Blocking has to close the message door as well as the page, or it only
  // stops the reading and not the writing.
  if (await isBlocked(coach.id, await getSessionUserId())) {
    return { ok: false, error: "Page not found." };
  }

  const [thread] = await db
    .insert(schema.inquiryThreads)
    // kind is spelled out on both sides. The unique index gained it when
    // feedback moved onto these tables, and a two-column ON CONFLICT no longer
    // matches any index: every request 500'd on "no unique or exclusion
    // constraint matching the ON CONFLICT specification".
    .values({
      coachUserId: coach.id,
      kind: "inquiry",
      requesterName: name,
      requesterEmail: email,
      requesterPhone: phone || null,
      coachUnread: 1,
    })
    .onConflictDoUpdate({
      target: [
        schema.inquiryThreads.coachUserId,
        schema.inquiryThreads.requesterEmail,
        schema.inquiryThreads.kind,
      ],
      set: {
        requesterName: name || sql`${schema.inquiryThreads.requesterName}`,
        // A second message with the number filled in adds it; a second one
        // without doesn't wipe what they gave the first time.
        requesterPhone: phone || sql`${schema.inquiryThreads.requesterPhone}`,
        coachUnread: sql`${schema.inquiryThreads.coachUnread} + 1`,
        lastMessageAt: new Date(),
      },
    })
    .returning();

  await db.insert(schema.inquiryMessages).values({ threadId: thread.id, fromCoach: false, body: message });

  // Keep this in notification history as well as the Messages thread. That
  // history still powers direct links and delivery outside the app.
  const senderId = viewerId;
  try {
    await addNotification(coach.id, {
      type: "message",
      title: `${name || email} sent you a message`,
      body: message,
      href: `/inbox/${thread.id}`,
      actorUserId: senderId,
    });
  } catch (err) {
    console.error("inquiry notification failed", err);
  }
  if (coach.emailMessages) {
    after(() =>
      emailCoachInquiry({ to: coach.email, requesterName: name, body: message }).catch((err) =>
        console.error("inquiry coach email failed", err),
      ),
    );
  }
  return { ok: true };
}

// COACH — reply to a thread they own; emails the visitor a link back.
// COACH — opening a thread clears its unread. An action rather than a side
// effect of the page render, so the list pages and the header badge can be
// revalidated out of the client router's cache.
export async function markThreadRead(threadId: string): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) return;
  const db = await getDb();
  const cleared = await db
    .update(schema.inquiryThreads)
    .set({ coachUnread: 0 })
    .where(
      and(
        eq(schema.inquiryThreads.id, threadId),
        eq(schema.inquiryThreads.coachUserId, userId),
        sql`${schema.inquiryThreads.coachUnread} > 0`,
      ),
    )
    .returning({ id: schema.inquiryThreads.id });
  // The badge is in every header, so everything cached goes. Only when
  // something actually changed: reopening a read thread busts nothing.
  if (cleared.length) revalidatePath("/", "layout");
}

// The same signal from the other chair: the person who wrote in, reading the
// coach's reply inside the app.
export async function markThreadReadAsRequester(threadId: string): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) return;
  const db = await getDb();
  const [me] = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me) return;
  const cleared = await db
    .update(schema.inquiryThreads)
    .set({ requesterUnread: 0 })
    .where(
      and(
        eq(schema.inquiryThreads.id, threadId),
        eq(schema.inquiryThreads.requesterEmail, me.email),
        sql`${schema.inquiryThreads.requesterUnread} > 0`,
      ),
    )
    .returning({ id: schema.inquiryThreads.id });
  if (cleared.length) revalidatePath("/", "layout");
}

export async function replyToInquiry(threadId: string, bodyRaw: string): Promise<Result> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const body = bodyRaw.trim().slice(0, 2000);
  if (body.length < 1) return { ok: false, error: "Write a message." };

  const db = await getDb();
  const [thread] = await db
    .select()
    .from(schema.inquiryThreads)
    .where(and(eq(schema.inquiryThreads.id, threadId), eq(schema.inquiryThreads.coachUserId, userId)));
  if (!thread) return { ok: false, error: "Conversation not found." };

  await db.insert(schema.inquiryMessages).values({ threadId, fromCoach: true, body });
  await db
    .update(schema.inquiryThreads)
    .set({ lastMessageAt: new Date(), coachUnread: 0 })
    .where(eq(schema.inquiryThreads.id, threadId));

  const [coach] = await db
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  // Whoever wrote in might have an account under that address; if they do,
  // the reply belongs in their app too: a thread they can answer without
  // leaving, plus notification history. The email still goes out (unless they turned
  // message emails off in settings); for a visitor with no account it's the
  // only door there is.
  const [them] = await db
    .select({ id: schema.users.id, emailMessages: schema.users.emailMessages })
    .from(schema.users)
    .where(eq(schema.users.email, thread.requesterEmail));

  if (thread.kind === "feedback") {
    const from = coach?.name?.trim() || "fittlist";
    if (them) {
      await addNotification(them.id, {
        type: "feedback_reply",
        title: `${from} replied to your feedback`,
        body,
        href: "/feedback",
      });
    }
    if (!them || them.emailMessages) {
      after(() =>
        emailFeedbackReply({ to: thread.requesterEmail, from, body }).catch((err) =>
          console.error("feedback reply email failed", err),
        ),
      );
    }
    revalidatePath(`/inbox/${threadId}`);
    revalidatePath("/feedback");
    revalidatePath("/inbox");
    return { ok: true };
  }

  if (them) {
    await db
      .update(schema.inquiryThreads)
      .set({ requesterUnread: sql`${schema.inquiryThreads.requesterUnread} + 1` })
      .where(eq(schema.inquiryThreads.id, threadId));
    try {
      await addNotification(them.id, {
        type: "message",
        title: `${coach?.name?.trim() || "Your coach"} sent you a message`,
        body,
        href: `/inbox/${threadId}`,
        actorUserId: userId,
      });
    } catch (err) {
      console.error("reply notification failed", err);
    }
  }
  if (!them || them.emailMessages) {
    const token = await inquiryToken(threadId);
    after(() =>
      emailRequesterReply({ to: thread.requesterEmail, coachName: coach?.name ?? "Your coach", body, token }).catch(
        (err) => console.error("inquiry reply email failed", err),
      ),
    );
  }

  revalidatePath(`/inbox/${threadId}`);
  revalidatePath("/inbox");
  revalidatePath("/inbox");
  return { ok: true };
}

// REQUESTER — reply from inside the app, no token involved. The session's
// email has to be the one the thread belongs to; that's the same proof the
// token link carries, held differently.
export async function replyAsRequester(threadId: string, bodyRaw: string): Promise<Result> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const body = bodyRaw.trim().slice(0, 2000);
  if (body.length < 1) return { ok: false, error: "Write a message." };

  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return { ok: false, error: "Session expired." };
  const [thread] = await db
    .select()
    .from(schema.inquiryThreads)
    .where(
      and(eq(schema.inquiryThreads.id, threadId), eq(schema.inquiryThreads.requesterEmail, me.email)),
    );
  if (!thread) return { ok: false, error: "Conversation not found." };

  await db.insert(schema.inquiryMessages).values({ threadId, fromCoach: false, body });
  await db
    .update(schema.inquiryThreads)
    .set({
      lastMessageAt: new Date(),
      coachUnread: sql`${schema.inquiryThreads.coachUnread} + 1`,
      requesterUnread: 0,
    })
    .where(eq(schema.inquiryThreads.id, threadId));

  const [coach] = await db
    .select({ email: schema.users.email, emailMessages: schema.users.emailMessages })
    .from(schema.users)
    .where(eq(schema.users.id, thread.coachUserId));
  try {
    await addNotification(thread.coachUserId, {
      type: "message",
      title: `${me.name.trim() || me.email} sent you a message`,
      body,
      href: `/inbox/${threadId}`,
      actorUserId: userId,
    });
  } catch (err) {
    console.error("inquiry notification failed", err);
  }
  if (coach && coach.emailMessages) {
    after(() =>
      emailCoachInquiry({ to: coach.email, requesterName: thread.requesterName, body }).catch((err) =>
        console.error("inquiry coach email failed", err),
      ),
    );
  }
  revalidatePath(`/inbox/${threadId}`);
  revalidatePath("/inbox");
  return { ok: true };
}

// VISITOR — reply from the tokenized link; bumps the coach's unread.
export async function replyByToken(token: string, bodyRaw: string): Promise<Result> {
  const threadId = await verifyInquiryToken(token);
  if (!threadId) return { ok: false, error: "This link is no longer valid." };
  const body = bodyRaw.trim().slice(0, 2000);
  if (body.length < 1) return { ok: false, error: "Write a message." };

  const db = await getDb();
  const [thread] = await db
    .select()
    .from(schema.inquiryThreads)
    .where(eq(schema.inquiryThreads.id, threadId));
  if (!thread) return { ok: false, error: "Conversation not found." };

  await db.insert(schema.inquiryMessages).values({ threadId, fromCoach: false, body });
  await db
    .update(schema.inquiryThreads)
    .set({ lastMessageAt: new Date(), coachUnread: sql`${schema.inquiryThreads.coachUnread} + 1` })
    .where(eq(schema.inquiryThreads.id, threadId));

  const [coach] = await db
    .select({ email: schema.users.email, emailMessages: schema.users.emailMessages })
    .from(schema.users)
    .where(eq(schema.users.id, thread.coachUserId));
  try {
    const [account] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, thread.requesterEmail));
    await addNotification(thread.coachUserId, {
      type: "message",
      title: `${thread.requesterName || thread.requesterEmail} sent you a message`,
      body,
      href: `/inbox/${threadId}`,
      actorUserId: account?.id ?? null,
    });
  } catch (err) {
    console.error("inquiry notification failed", err);
  }
  if (coach && coach.emailMessages) {
    after(() =>
      emailCoachInquiry({ to: coach.email, requesterName: thread.requesterName, body }).catch((err) =>
        console.error("inquiry coach email failed", err),
      ),
    );
  }
  revalidatePath(`/m/${token}`);
  return { ok: true };
}
