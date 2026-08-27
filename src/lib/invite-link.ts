import { createHash, randomBytes } from "crypto";
import { getDb, schema } from "@/db";
import { siteOrigin } from "@/lib/format";
import { sendMessage } from "@/lib/mailer";
import { emailHtml } from "@/lib/email-html";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// Mint a 24h one-time sign-in link and email it. Shared by the admin panel and
// by beta users inviting their own people — one code path so an invite from a
// coach lands exactly like an invite from us, fallback copy and all.
export async function sendInviteLink({
  email,
  subject,
  intro,
  invite = false,
}: {
  email: string;
  subject: string;
  intro: string;
  /** Invites carry a fallback: the one-tap link only signs you in on the
   *  browser that opens it, and mail apps open their own. */
  invite?: boolean;
}): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const db = await getDb();
  await db.insert(schema.magicLinks).values({
    email,
    tokenHash: sha256(token),
    ip: "admin",
    purpose: invite ? "signup" : "login",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  const url = `${siteOrigin()}/auth/magic?token=${token}&invited=1`;
  const fallbackText = invite
    ? `Opening this in a different browser and it asks you to sign in? Go to ${siteOrigin()}/?invited=1 and sign up with this email address. Your invite is on it.`
    : "";
  const body = [
    intro.replace(/:$/, "."),
    "This link works once and expires in 24 hours. Once you're in, set a password. Then you can sign in on any browser without waiting on an email.",
    ...(fallbackText ? [fallbackText] : []),
  ];
  await sendMessage({
    to: email,
    kind: "magic_link",
    subject,
    text: `${body.join("\n\n")}\n\n${url}`,
    html: emailHtml({
      heading: invite ? "You're invited to fittlist" : "Sign in to fittlist",
      body,
      cta: { label: invite ? "Set up your page" : "Sign in", url },
      footer: `This was sent to ${email} by fittlist. If you weren't expecting it, ignore it. Nothing has been created for that address.`,
    }),
  });
  return url;
}
