"use server";

import { createHash, randomInt } from "crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb, schema } from "@/db";
import { sendMessage } from "@/lib/mailer";
import { redirect } from "next/navigation";
import { createSession, destroySession, getSessionUserId } from "@/lib/session";
import { RESERVED_HANDLES, slug } from "@/lib/format";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODES_PER_EMAIL = 3; // per TTL window
const MAX_CODES_PER_IP = 10;
const MAX_ATTEMPTS = 5;

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "local").split(",")[0].trim();
}

export async function requestCode(emailRaw: string): Promise<{ ok: boolean; error?: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "That doesn't look like an email address." };
  }
  const db = await getDb();
  const since = new Date(Date.now() - CODE_TTL_MS);
  const ip = await clientIp();

  const [byEmail] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.authCodes)
    .where(and(eq(schema.authCodes.email, email), gt(schema.authCodes.createdAt, since)));
  if (byEmail.n >= MAX_CODES_PER_EMAIL) {
    return { ok: false, error: "Too many codes requested. Try again in a few minutes." };
  }
  const [byIp] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.authCodes)
    .where(and(eq(schema.authCodes.ip, ip), gt(schema.authCodes.createdAt, since)));
  if (byIp.n >= MAX_CODES_PER_IP) {
    return { ok: false, error: "Too many codes requested. Try again in a few minutes." };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(schema.authCodes).values({
    email,
    codeHash: hashCode(code),
    ip,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  await sendMessage({
    to: email,
    kind: "otp",
    subject: `${code} is your fittlist code`,
    text: `Your fittlist login code is ${code}. It expires in 10 minutes.\n\nIf you didn't request this, ignore this email.`,
  });
  return { ok: true };
}

export async function verifyCode(
  emailRaw: string,
  codeRaw: string,
): Promise<{ ok: boolean; needsProfile?: boolean; error?: string }> {
  const email = emailRaw.trim().toLowerCase();
  const code = codeRaw.replace(/\D/g, "");
  if (code.length !== 6) return { ok: false, error: "Enter the 6-digit code." };

  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.authCodes)
    .where(
      and(
        eq(schema.authCodes.email, email),
        isNull(schema.authCodes.consumedAt),
        gt(schema.authCodes.expiresAt, new Date()),
      ),
    )
    .orderBy(sql`${schema.authCodes.createdAt} desc`)
    .limit(1);
  if (!row) return { ok: false, error: "Code expired. Request a new one." };
  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: "Too many tries. Request a new code." };
  }
  await db
    .update(schema.authCodes)
    .set({ attempts: row.attempts + 1 })
    .where(eq(schema.authCodes.id, row.id));
  if (row.codeHash !== hashCode(code)) {
    return { ok: false, error: "That code didn't match. Check and try again." };
  }
  await db.update(schema.authCodes).set({ consumedAt: new Date() }).where(eq(schema.authCodes.id, row.id));

  let [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!user) {
    [user] = await db.insert(schema.users).values({ email }).returning();
  }
  await createSession(user.id);
  return { ok: true, needsProfile: !user.handle };
}

export async function claimProfile(
  nameRaw: string,
  via: string | null = null,
): Promise<{ ok: boolean; handle?: string; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired. Log in again." };
  const name = nameRaw.trim();
  if (!name) return { ok: false, error: "Enter your name." };
  // Growth-loop attribution: signup arrived through a public page's footer.
  const signupSource = via ? `footer:${slug(via)}`.slice(0, 64) : null;

  const db = await getDb();
  const base = slug(name);
  let handle = base;
  for (let i = 2; ; i++) {
    if (!RESERVED_HANDLES.has(handle)) {
      const [taken] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.handle, handle));
      if (!taken || taken.id === userId) break;
    }
    handle = `${base}${i}`;
  }
  await db
    .update(schema.users)
    .set({ name, handle, ...(signupSource ? { signupSource } : {}) })
    .where(eq(schema.users.id, userId));
  return { ok: true, handle };
}

export async function logout() {
  await destroySession();
  redirect("/");
}
