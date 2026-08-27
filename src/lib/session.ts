import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { sessionSecret } from "@/lib/secret";

const COOKIE = "fl_session";
const MAX_AGE = 60 * 60 * 24 * 90; // 90 days
export const PASSWORD_PROMPT_COOKIE = "fl_set_password";
export const PASSWORD_PROMPT_MAX_AGE = 60 * 60 * 24;
export const MAGIC_PENDING_COOKIE = "fl_magic_pending";
export const MAGIC_PENDING_MAX_AGE = 15 * 60;

export type PasswordPromptMode = "set" | "reset";

// Record that this user just signed in. Best-effort: a DB hiccup here must
// never block the login itself, so failures are swallowed.
async function stampLogin(userId: string) {
  try {
    const { eq } = await import("drizzle-orm");
    const { getDb, schema } = await import("@/db");
    const db = await getDb();
    await db
      .update(schema.users)
      .set({ lastLoginAt: new Date() })
      .where(eq(schema.users.id, userId));
  } catch {
    /* ignore */
  }
}

function secret() {
  return sessionSecret();
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
  await stampLogin(userId);
}

export async function getSessionUserId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.uid === "string" ? payload.uid : null;
  } catch {
    return null;
  }
}

export async function destroySession() {
  const jar = await cookies();
  // Overwrite with an already-expired cookie using the SAME path the session
  // was set with, so the browser actually drops it.
  jar.set(COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
}

/** A magic-link login can cross onboarding and several redirects before the
 * first app screen. Keep its one-time password reminder in an HttpOnly cookie
 * so query parameters do not get lost (or linger in copied URLs). A reset
 * cookie also carries the random magic-link row id, binding that short-lived
 * authority to the browser that explicitly confirmed the email link. */
export async function passwordPromptPending(): Promise<PasswordPromptMode | null> {
  const jar = await cookies();
  const value = jar.get(PASSWORD_PROMPT_COOKIE)?.value;
  if (value === "set") return "set";
  if (value?.startsWith("reset:")) return "reset";
  return null;
}

export async function passwordResetGrantId(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(PASSWORD_PROMPT_COOKIE)?.value ?? "";
  const id = value.startsWith("reset:") ? value.slice("reset:".length) : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

export async function markPasswordPrompt(
  mode: PasswordPromptMode,
  resetGrantId: string | null = null,
): Promise<void> {
  const jar = await cookies();
  const value = mode === "reset" && resetGrantId ? `reset:${resetGrantId}` : "set";
  jar.set(PASSWORD_PROMPT_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // Reset authority is intentionally as short-lived as the email token.
    // The non-sensitive "set one for next time" reminder may survive a day.
    maxAge: mode === "reset" ? MAGIC_PENDING_MAX_AGE : PASSWORD_PROMPT_MAX_AGE,
    path: "/",
  });
}

export async function clearPasswordPrompt(): Promise<void> {
  const jar = await cookies();
  jar.set(PASSWORD_PROMPT_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
}

/** The email URL itself performs no mutation. It only parks the raw,
 * short-lived token in an HttpOnly cookie and redirects to a clean
 * interstitial. The explicit form POST reads it from here. */
export async function pendingMagicToken(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(MAGIC_PENDING_COOKIE)?.value ?? "";
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export async function clearPendingMagicToken(): Promise<void> {
  const jar = await cookies();
  jar.set(MAGIC_PENDING_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
}
