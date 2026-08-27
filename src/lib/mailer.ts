import { getDb, schema } from "@/db";

// The notification sender is deliberately isolated behind this interface -
// per the brief, it is the piece most likely to move to SMS later. Callers
// never touch the transport.

export type OutboundKind =
  | "otp"
  | "magic_link"
  | "follow_confirmation"
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

export type SendResult = { ok: boolean; status: string };

export async function sendMessage({
  to,
  subject,
  text,
  html,
  kind,
  headers,
}: SendArgs): Promise<SendResult> {
  let status = "sent";
  let ok = true;
  try {
    if (process.env.RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
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
      if (!res.ok) {
        ok = false;
        status = `error:${res.status}`;
      }
    } else if (process.env.NODE_ENV === "production") {
      // Authentication and notification screens must not claim delivery when
      // a production deployment has no provider configured.
      ok = false;
      status = "error:not_configured";
      console.error(`[mail:${kind}] delivery provider is not configured`);
    } else {
      // Local-only fallback: developers need the one-time URL to exercise the
      // auth flow. Production never prints recipients or message bodies.
      console.log(`[mail:${kind}] to=${to} subject="${subject}"\n${text}`);
      status = "logged";
    }
  } catch (err) {
    ok = false;
    status = "error";
    console.error("sendMessage failed", err);
  }
  try {
    const db = await getDb();
    // Delivery logs are operational metadata, not a second mailbox. In
    // particular, never persist the bearer URL inside a magic-link email.
    await db.insert(schema.messageLog).values({ toAddress: to, kind, body: "[content omitted]", status });
  } catch {
    // A logging outage must not turn a delivered sign-in email into a false
    // failure (or prompt the user to request several valid links).
    console.error(`[mail:${kind}] couldn't record delivery status`);
  }
  return { ok, status };
}
