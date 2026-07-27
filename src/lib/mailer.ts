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
  | "inquiry";

export interface SendArgs {
  to: string;
  subject: string;
  text: string;
  kind: OutboundKind;
  headers?: Record<string, string>;
}

export async function sendMessage({ to, subject, text, kind, headers }: SendArgs): Promise<void> {
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
