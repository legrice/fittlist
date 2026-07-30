import { getDb, schema } from "@/db";

// The notification sender is deliberately isolated behind this interface -
// per the brief, it is the piece most likely to move to SMS later. Callers
// never touch the transport.

export type OutboundKind =
  | "otp"
  | "magic_link"
  | "schedule_change"
  | "welcome"
  | "announcement"
  | "weekly_schedule"
  | "inquiry"
  | "feedback"
  | "cancelled"
  | "adminstats";

export interface SendArgs {
  to: string;
  subject: string;
  text: string;
  /** HTML part. Send one wherever possible: a text-only mail carrying a bare
   *  URL is what phishing looks like, and filters score it accordingly. */
  html?: string;
  kind: OutboundKind;
  headers?: Record<string, string>;
}

export async function sendMessage({
  to,
  subject,
  text,
  html,
  kind,
  headers,
}: SendArgs): Promise<void> {
  let status = "sent";
  try {
    if (process.env.RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.MAIL_FROM || "fittlist <hello@fittlist.co>",
          to: [to],
          subject,
          text,
          ...(html ? { html } : {}),
          // A transactional mail nobody can reply to is a spam signal, and an
          // unanswerable sign-in email is bad manners besides.
          ...(process.env.MAIL_REPLY_TO ? { reply_to: process.env.MAIL_REPLY_TO } : {}),
          ...(headers ? { headers } : {}),
        }),
      });
      if (!res.ok) status = `error:${res.status}`;
    } else {
      // Dev fallback: no email provider configured, log to console.
      console.log(`[mail:${kind}] to=${to} subject="${subject}"\n${text}`);
      status = "logged";
    }
  } catch (err) {
    status = "error";
    console.error("sendMessage failed", err);
  }
  const db = await getDb();
  await db.insert(schema.messageLog).values({ toAddress: to, kind, body: text, status });
}
