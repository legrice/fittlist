import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { adminEmails } from "@/lib/admin";

type FeedbackViewer = {
  id: string;
  email: string;
  onboardedAt: Date | null;
  createdAt: Date;
  feedbackPromptedAt: Date | null;
};

/** How long someone uses the app before we ask what they think. Long enough to
 *  have an opinion, short enough that they still remember what annoyed them.
 *  Overridable so a test doesn't have to wait three days. */
export function promptAfterDays(): number {
  const raw = Number(process.env.FEEDBACK_PROMPT_AFTER_DAYS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 3;
}

/** And how long before we'd ask a second time, having been ignored once. */
const ASK_AGAIN_DAYS = 60;

export type FeedbackHost = { id: string; name: string; email: string };

// Who feedback goes to: the first ADMIN_EMAILS address with an account.
//
// It's a real user row rather than a mailbox on purpose. A thread needs an
// owner to hang off, and routing it to an account means the reply comes back
// through the same inbox as everything else instead of turning into email.
//
// Null when no admin has signed up yet. Callers hide the door rather than
// offering one with nobody behind it.
export async function feedbackHost(): Promise<FeedbackHost | null> {
  const emails = adminEmails();
  if (!emails.length) return null;
  const db = await getDb();
  const rows = await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(inArray(schema.users.email, emails));
  // Keep ADMIN_EMAILS order: the first one listed is the one who wants these.
  for (const e of emails) {
    const hit = rows.find((r) => r.email.toLowerCase() === e);
    if (hit) return hit;
  }
  return null;
}

// Is it time to ask this person how it's going?
//
// Only once they've had the app long enough to have an opinion, only if
// they've never written in, and only if we haven't already asked recently. A
// prompt that fires on day one gets "seems fine"; one that fires every session
// gets closed without reading.
export async function feedbackPromptDue(userId: string): Promise<boolean> {
  const host = await feedbackHost();
  if (!host || host.id === userId) return false;

  const db = await getDb();
  const [me] = await db
    .select({
      email: schema.users.email,
      onboardedAt: schema.users.onboardedAt,
      createdAt: schema.users.createdAt,
      promptedAt: schema.users.feedbackPromptedAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me) return false;
  return feedbackPromptDueFor(
    {
      id: userId,
      email: me.email,
      onboardedAt: me.onboardedAt,
      createdAt: me.createdAt,
      feedbackPromptedAt: me.promptedAt,
    },
    host,
  );
}

/** The shell already has this stable slice of the viewer. Reusing it avoids a
 * second users lookup; accepting the resolved host also avoids looking it up
 * twice when the prompt is actually rendered. */
export async function feedbackPromptDueFor(me: FeedbackViewer, host: FeedbackHost): Promise<boolean> {
  if (host.id === me.id || !me.onboardedAt) return false;

  const now = Date.now();
  const day = 86_400_000;
  const since = me.onboardedAt;
  if (now - since.getTime() < promptAfterDays() * day) return false;
  if (me.feedbackPromptedAt && now - me.feedbackPromptedAt.getTime() < ASK_AGAIN_DAYS * day) return false;

  // Already told us something: they know where the door is.
  const db = await getDb();
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
  return !thread;
}
