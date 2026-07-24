import { and, eq, isNull } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { getDb, schema } from "@/db";
import { sendMessage } from "@/lib/mailer";
import { fmtDays, fmtTime } from "@/lib/format";

// All list email goes through here — the piece most likely to move to SMS
// later, so callers only describe the change and never touch the channel.

function secret() {
  return new TextEncoder().encode(process.env.SESSION_SECRET || "dev-secret-change-me");
}

export function origin(): string {
  return process.env.NEXT_PUBLIC_ORIGIN || "https://fittlist.co";
}

export async function unsubTokenFor(subscriberId: string): Promise<string> {
  // No expiry: an unsubscribe link must keep working forever.
  return new SignJWT({ aud: "unsub" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subscriberId)
    .sign(secret());
}

export async function verifyUnsubToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.aud !== "unsub" || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

async function unsubFooter(subscriberId: string): Promise<{ text: string; headers: Record<string, string> }> {
  const token = await unsubTokenFor(subscriberId);
  const pageUrl = `${origin()}/u/${token}`;
  const clickUrl = `${origin()}/api/unsub/${token}`;
  return {
    text: `\n\nUnsubscribe any time: ${pageUrl}`,
    headers: {
      "List-Unsubscribe": `<${clickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

type Trainer = { id: string; name: string; handle: string | null };

export async function sendWelcome(trainer: Trainer, subscriber: { id: string; email: string }) {
  const url = `fittlist.co/${trainer.handle}`;
  const unsub = await unsubFooter(subscriber.id);
  await sendMessage({
    to: subscriber.email,
    kind: "welcome",
    subject: `You're on ${trainer.name}'s list`,
    text:
      `You're on the list for ${trainer.name}'s coaching schedule.\n\n` +
      `You'll get an email when it changes — new classes, time changes, cancellations. Nothing else, ever.\n\n` +
      `The current week is always at ${url}.` +
      unsub.text,
    headers: unsub.headers,
  });
}

export type ScheduleChange = {
  verb: "added" | "removed";
  className: string;
  days: number[];
  startTime: string; // "HH:MM"
  studioName: string;
};

/** One email to every active subscriber for one publish/delete action.
    Returns how many were emailed. */
export async function notifyScheduleChange(trainerUserId: string, change: ScheduleChange): Promise<number> {
  const db = await getDb();
  const [trainer] = await db.select().from(schema.users).where(eq(schema.users.id, trainerUserId));
  if (!trainer?.handle) return 0;
  const subs = await db
    .select()
    .from(schema.subscribers)
    .where(
      and(
        eq(schema.subscribers.trainerUserId, trainerUserId),
        isNull(schema.subscribers.optedOutAt),
      ),
    );
  if (!subs.length) return 0;

  const line =
    `${change.className} ${change.verb} ${fmtDays(change.days)} ${fmtTime(change.startTime)}` +
    ` at ${change.studioName} → fittlist.co/${trainer.handle}`;

  for (const sub of subs) {
    const unsub = await unsubFooter(sub.id);
    await sendMessage({
      to: sub.email,
      kind: "schedule_change",
      subject: `${trainer.name} updated their schedule`,
      text: line + unsub.text,
      headers: unsub.headers,
    });
  }
  return subs.length;
}
