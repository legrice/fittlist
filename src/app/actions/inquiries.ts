"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getDb, schema } from "@/db";
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
): Promise<Result> {
  const email = emailRaw.trim().toLowerCase();
  const name = nameRaw.trim().slice(0, 80);
  const message = messageRaw.trim().slice(0, 2000);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email." };
  if (message.length < 2) return { ok: false, error: "Write a short message." };

  const db = await getDb();
  const [coach] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!coach) return { ok: false, error: "Page not found." };

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
        coachUnread: sql`${schema.inquiryThreads.coachUnread} + 1`,
        lastMessageAt: new Date(),
      },
    })
    .returning();

  await db.insert(schema.inquiryMessages).values({ threadId: thread.id, fromCoach: false, body: message });

  after(() =>
    emailCoachInquiry({ to: coach.email, requesterName: name, body: message }).catch((err) =>
      console.error("inquiry coach email failed", err),
    ),
  );
  return { ok: true };
}

// COACH — reply to a thread they own; emails the visitor a link back.
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

  // Feedback comes from someone with an account, so the reply belongs in the
  // app: a bell and a thread they already know how to find. A private-session
  // request comes from a visitor who has neither, and only has the token link.
  if (thread.kind === "feedback") {
    const [them] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, thread.requesterEmail));
    const from = coach?.name?.trim() || "fittlist";
    if (them) {
      await addNotification(them.id, {
        type: "feedback_reply",
        title: `${from} replied to your feedback`,
        body,
        href: "/feedback",
      });
    }
    after(() =>
      emailFeedbackReply({ to: thread.requesterEmail, from, body }).catch((err) =>
        console.error("feedback reply email failed", err),
      ),
    );
    revalidatePath(`/inbox/${threadId}`);
    revalidatePath("/feedback");
    revalidatePath("/updates");
    return { ok: true };
  }

  const token = await inquiryToken(threadId);
  after(() =>
    emailRequesterReply({ to: thread.requesterEmail, coachName: coach?.name ?? "Your coach", body, token }).catch(
      (err) => console.error("inquiry reply email failed", err),
    ),
  );

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
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, thread.coachUserId));
  if (coach) {
    after(() =>
      emailCoachInquiry({ to: coach.email, requesterName: thread.requesterName, body }).catch((err) =>
        console.error("inquiry coach email failed", err),
      ),
    );
  }
  revalidatePath(`/m/${token}`);
  return { ok: true };
}
