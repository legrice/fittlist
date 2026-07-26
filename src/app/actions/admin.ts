"use server";

import { createHash, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { currentAdmin } from "@/lib/admin";
import { siteOrigin } from "@/lib/format";
import { sendMessage } from "@/lib/mailer";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// Add a studio straight to the shared directory from the admin panel.
export async function adminAddStudio(
  nameRaw: string,
  addressRaw: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  const name = nameRaw.trim();
  const address = addressRaw.trim();
  if (!name) return { ok: false, error: "Enter the studio name." };
  if (!address) return { ok: false, error: "Enter the address." };
  const db = await getDb();
  await db.insert(schema.studios).values({ name, address, createdByUserId: admin.id });
  revalidatePath("/admin");
  return { ok: true };
}

// Mint a one-time sign-in link for a coach and email it. Returns the URL too so
// the admin can copy it and send it any way they like (handy while email
// delivery is still flaky in beta). Admin links last 24h, not the usual 15 min.
export async function adminSendMagicLink(
  emailRaw: string,
): Promise<{ ok: boolean; url?: string; emailed?: boolean; error?: string }> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "That doesn't look like an email address." };

  const token = randomBytes(32).toString("hex");
  const db = await getDb();
  await db.insert(schema.magicLinks).values({
    email,
    tokenHash: sha256(token),
    ip: "admin",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  const url = `${siteOrigin()}/auth/magic?token=${token}`;
  await sendMessage({
    to: email,
    kind: "magic_link",
    subject: "Your fittlist sign-in link",
    text: `Tap to sign in to fittlist:\n\n${url}\n\nThis link works once and expires in 24 hours.`,
  });
  return { ok: true, url, emailed: true };
}
