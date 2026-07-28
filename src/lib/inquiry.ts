import { SignJWT, jwtVerify } from "jose";
import { sendMessage } from "@/lib/mailer";
import { siteOrigin } from "@/lib/format";

// A private-training inquiry links a visitor (no account) to a coach. The
// visitor keeps access to the thread through a signed, non-expiring token in
// their reply link — same idea as the unsubscribe token.

function secret() {
  return new TextEncoder().encode(process.env.SESSION_SECRET || "dev-secret-change-me");
}

export async function inquiryToken(threadId: string): Promise<string> {
  return new SignJWT({ aud: "inquiry" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(threadId)
    .sign(secret());
}

export async function verifyInquiryToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.aud !== "inquiry" || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

/** New visitor message → email the coach, pointing them at their inbox. */
export async function emailCoachInquiry(opts: {
  to: string;
  requesterName: string;
  body: string;
}) {
  const who = opts.requesterName || "Someone";
  await sendMessage({
    to: opts.to,
    kind: "inquiry",
    subject: `${who} wants to train with you`,
    text:
      `${who} sent you a private-session request on fittlist:\n\n"${opts.body}"\n\n` +
      `Reply from your inbox: ${siteOrigin()}/updates?tab=messages`,
  });
}

/** Someone wrote in about the app. Goes to whoever ADMIN_EMAILS names first. */
export async function emailFeedback(opts: { to: string; from: string; body: string }) {
  await sendMessage({
    to: opts.to,
    kind: "feedback",
    subject: `Feedback from ${opts.from}`,
    text:
      `${opts.from} sent feedback on fittlist:\n\n"${opts.body}"\n\n` +
      `Reply from your inbox: ${siteOrigin()}/updates?tab=messages`,
  });
}

/** Our reply to feedback. They have an account, so the link is the app itself. */
export async function emailFeedbackReply(opts: { to: string; from: string; body: string }) {
  await sendMessage({
    to: opts.to,
    kind: "feedback",
    subject: "Re: your fittlist feedback",
    text:
      `${opts.from} replied to your feedback:\n\n"${opts.body}"\n\n` +
      `Read and reply: ${siteOrigin()}/feedback`,
  });
}

/** Coach reply → email the visitor with a link back into the thread. */
export async function emailRequesterReply(opts: {
  to: string;
  coachName: string;
  body: string;
  token: string;
}) {
  await sendMessage({
    to: opts.to,
    kind: "inquiry",
    subject: `${opts.coachName} replied`,
    text:
      `${opts.coachName} replied to your message:\n\n"${opts.body}"\n\n` +
      `Read and reply: ${siteOrigin()}/m/${opts.token}`,
  });
}
