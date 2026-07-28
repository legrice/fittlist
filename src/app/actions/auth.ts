"use server";

import { createHash, randomBytes } from "crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { getDb, schema } from "@/db";
import { nextAvatarColor } from "@/lib/avatar-server";
import { sendMessage } from "@/lib/mailer";
import { createSession, destroySession, getSessionUserId } from "@/lib/session";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { pubKeyFromStore, pubKeyToStore, rpInfo, setChallenge, takeChallenge } from "@/lib/webauthn";
import { acceptInvite, emailInvited, INVITE_MSG } from "@/lib/invites";
import { fansEnabled } from "@/lib/flags";
import { RESERVED_HANDLES, siteOrigin, slug } from "@/lib/format";

const MAGIC_TTL_MS = 15 * 60 * 1000;
const MAX_LINKS_PER_EMAIL = 3; // per TTL window
const MAX_LINKS_PER_IP = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "local").split(",")[0].trim();
}

// ---- password: one form that logs in an existing account or signs up a new one
export async function passwordAuth(
  emailRaw: string,
  password: string,
  asFan = false,
): Promise<{ ok: boolean; needsProfile?: boolean; hasPasskey?: boolean; fan?: boolean; error?: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "That doesn't look like an email address." };
  if (!password) return { ok: false, error: "Enter your password." };

  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));

  if (!user) {
    // No account yet: treat this as sign-up.
    // Fans (when the fan side is enabled) skip the invite gate — the beta gate
    // protects coach handles, not demand.
    const fan = asFan && fansEnabled();
    if (!fan && !(await emailInvited(email))) return { ok: false, error: INVITE_MSG };
    const problem = passwordProblem(password);
    if (problem) return { ok: false, error: problem };
    const passwordHash = await hashPassword(password);
    const [created] = await db
      .insert(schema.users)
      .values({ email, passwordHash, kind: fan ? "fan" : "coach", avatarColor: await nextAvatarColor() })
      .returning();
    if (!fan) await acceptInvite(email, created.id);
    await createSession(created.id);
    return { ok: true, needsProfile: !fan, hasPasskey: false, fan };
  }
  if (!user.passwordHash) {
    return {
      ok: false,
      error: "This account has no password yet. Use a magic link, then add one in your account.",
    };
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, error: "Wrong email or password." };
  }
  await createSession(user.id);
  const passkeys = await db
    .select({ id: schema.credentials.id })
    .from(schema.credentials)
    .where(eq(schema.credentials.userId, user.id));
  return {
    ok: true,
    needsProfile: user.kind !== "fan" && !user.handle,
    hasPasskey: passkeys.length > 0,
    fan: user.kind === "fan",
  };
}

// Sensitive account changes re-authenticate with the current password when the
// account has one, so a hijacked session can't silently take everything over.
export async function setPassword(
  newPassword: string,
  currentPassword: string = "",
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired. Log in again." };
  const problem = passwordProblem(newPassword);
  if (problem) return { ok: false, error: problem };
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) return { ok: false, error: "Session expired. Log in again." };
  if (user.passwordHash && !(await verifyPassword(currentPassword, user.passwordHash))) {
    return { ok: false, error: "Current password is incorrect." };
  }
  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(newPassword) })
    .where(eq(schema.users.id, userId));
  return { ok: true };
}

export async function changeEmail(
  newEmailRaw: string,
  currentPassword: string = "",
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired. Log in again." };
  const email = newEmailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "That doesn't look like an email address." };
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) return { ok: false, error: "Session expired. Log in again." };
  if (email === user.email) return { ok: true };
  if (user.passwordHash && !(await verifyPassword(currentPassword, user.passwordHash))) {
    return { ok: false, error: "Enter your current password to change your email." };
  }
  const [taken] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  if (taken && taken.id !== userId) return { ok: false, error: "That email is already in use." };
  await db.update(schema.users).set({ email }).where(eq(schema.users.id, userId));
  return { ok: true };
}

export async function removePasskeys(): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const db = await getDb();
  await db.delete(schema.credentials).where(eq(schema.credentials.userId, userId));
  return { ok: true };
}

// ---- magic link: email a one-tap sign-in URL
export async function requestMagicLink(
  emailRaw: string,
  via: string | null = null,
): Promise<{ ok: boolean; error?: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "That doesn't look like an email address." };

  const db = await getDb();

  // Invite gate: an email with no account yet must be invited to receive a link
  // (existing accounts can always request a login link).
  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  if (!existing && !(await emailInvited(email))) return { ok: false, error: INVITE_MSG };

  const since = new Date(Date.now() - MAGIC_TTL_MS);
  const ip = await clientIp();

  const [byEmail] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.magicLinks)
    .where(and(eq(schema.magicLinks.email, email), gt(schema.magicLinks.createdAt, since)));
  if (byEmail.n >= MAX_LINKS_PER_EMAIL) {
    return { ok: false, error: "Too many links requested. Try again in a few minutes." };
  }
  const [byIp] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.magicLinks)
    .where(and(eq(schema.magicLinks.ip, ip), gt(schema.magicLinks.createdAt, since)));
  if (byIp.n >= MAX_LINKS_PER_IP) {
    return { ok: false, error: "Too many links requested. Try again in a few minutes." };
  }

  const token = randomBytes(32).toString("hex");
  await db.insert(schema.magicLinks).values({
    email,
    tokenHash: sha256(token),
    ip,
    via: via ? slug(via).slice(0, 64) : null,
    expiresAt: new Date(Date.now() + MAGIC_TTL_MS),
  });
  const url = `${siteOrigin()}/auth/magic?token=${token}`;
  await sendMessage({
    to: email,
    kind: "magic_link",
    subject: "Your fittlist sign-in link",
    text: `Tap to sign in to fittlist:\n\n${url}\n\nThis link works once and expires in 15 minutes. If you didn't request it, ignore this email.`,
  });
  return { ok: true };
}

// Consumed by the /auth/magic route handler. Returns null on a bad/expired
// token; otherwise creates the session and reports what to do next.
export async function consumeMagicToken(
  token: string,
): Promise<{ needsProfile: boolean; fan: boolean; via: string | null } | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.magicLinks)
    .where(
      and(
        eq(schema.magicLinks.tokenHash, sha256(token)),
        isNull(schema.magicLinks.consumedAt),
        gt(schema.magicLinks.expiresAt, new Date()),
      ),
    )
    .orderBy(sql`${schema.magicLinks.createdAt} desc`)
    .limit(1);
  if (!row) return null;
  await db
    .update(schema.magicLinks)
    .set({ consumedAt: new Date() })
    .where(eq(schema.magicLinks.id, row.id));

  let [user] = await db.select().from(schema.users).where(eq(schema.users.email, row.email));
  if (!user) {
    // Defense in depth: requestMagicLink already gates, but never create an
    // account here for an email that isn't invited.
    if (!(await emailInvited(row.email))) return null;
    [user] = await db
      .insert(schema.users)
      .values({ email: row.email, avatarColor: await nextAvatarColor() })
      .returning();
    await acceptInvite(row.email, user.id);
  }
  await createSession(user.id);
  return { needsProfile: user.kind !== "fan" && !user.handle, fan: user.kind === "fan", via: row.via };
}

// ---- passkeys (WebAuthn): enroll while logged in, then sign in with biometrics
export async function beginPasskeyRegistration(): Promise<
  { ok: true; options: PublicKeyCredentialCreationOptionsJSON } | { ok: false; error: string }
> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Log in first." };
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) return { ok: false, error: "Log in first." };
  const existing = await db
    .select()
    .from(schema.credentials)
    .where(eq(schema.credentials.userId, userId));
  const { rpID, rpName } = await rpInfo();
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email,
    userDisplayName: user.name || user.email,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports as AuthenticatorTransportInput[],
    })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
  await setChallenge(options.challenge);
  return { ok: true, options };
}

export async function finishPasskeyRegistration(
  response: RegistrationResponseJSON,
  label: string,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Log in first." };
  const challenge = await takeChallenge();
  if (!challenge) return { ok: false, error: "That took too long. Try again." };
  const { rpID, origin } = await rpInfo();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch {
    return { ok: false, error: "Couldn't add that passkey. Try again." };
  }
  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, error: "Couldn't add that passkey. Try again." };
  }
  const { credential } = verification.registrationInfo;
  const db = await getDb();
  await db.insert(schema.credentials).values({
    userId,
    credentialId: credential.id,
    publicKey: pubKeyToStore(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? [],
    label: label.trim().slice(0, 40) || "Passkey",
  });
  return { ok: true };
}

export async function beginPasskeyLogin(): Promise<{ options: PublicKeyCredentialRequestOptionsJSON }> {
  const { rpID } = await rpInfo();
  const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred" });
  await setChallenge(options.challenge);
  return { options };
}

export async function finishPasskeyLogin(
  response: AuthenticationResponseJSON,
): Promise<{ ok: boolean; needsProfile?: boolean; fan?: boolean; error?: string }> {
  const challenge = await takeChallenge();
  if (!challenge) return { ok: false, error: "That took too long. Try again." };
  const db = await getDb();
  const [cred] = await db
    .select()
    .from(schema.credentials)
    .where(eq(schema.credentials.credentialId, response.id));
  if (!cred) return { ok: false, error: "Passkey not recognized. Try another way." };
  const { rpID, origin } = await rpInfo();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.credentialId,
        publicKey: pubKeyFromStore(cred.publicKey),
        counter: cred.counter,
        transports: cred.transports as AuthenticatorTransportInput[],
      },
    });
  } catch {
    return { ok: false, error: "That passkey didn't verify. Try another way." };
  }
  if (!verification.verified) return { ok: false, error: "That passkey didn't verify. Try another way." };
  await db
    .update(schema.credentials)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(schema.credentials.id, cred.id));
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, cred.userId));
  await createSession(user.id);
  return { ok: true, needsProfile: user.kind !== "fan" && !user.handle, fan: user.kind === "fan" };
}

export async function claimProfile(
  nameRaw: string,
  handleRaw: string = "",
  via: string | null = null,
): Promise<{ ok: boolean; handle?: string; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired. Log in again." };
  const name = nameRaw.trim();
  if (!name) return { ok: false, error: "Enter your name." };
  // Growth-loop attribution: signup arrived through a public page's footer.
  const signupSource = via ? `footer:${slug(via)}`.slice(0, 64) : null;

  const db = await getDb();
  // The coach picks their URL; fall back to a slug of their name if left blank.
  const chosen = slug(handleRaw.trim() || name);
  if (!chosen) return { ok: false, error: "Pick a URL for your page." };
  if (RESERVED_HANDLES.has(chosen)) {
    return { ok: false, error: "That URL isn't available. Try another." };
  }
  const [taken] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.handle, chosen));
  if (taken && taken.id !== userId) {
    return { ok: false, error: `fittlist.co/${chosen} is taken. Try another.` };
  }
  // Claiming a handle is what makes someone a coach — a member who decides to
  // post their own classes comes through here too, and stops being a "fan" the
  // moment they do. Following, going marks and their week all carry over; the
  // kind only decides where the app opens and what chrome they get.
  await db
    .update(schema.users)
    .set({ name, handle: chosen, kind: "coach", ...(signupSource ? { signupSource } : {}) })
    .where(eq(schema.users.id, userId));
  return { ok: true, handle: chosen };
}

export async function logout() {
  await destroySession();
  redirect("/");
}

// SimpleWebAuthn's transport union; kept local so callers stay untyped-JSON.
type AuthenticatorTransportInput =
  | "ble"
  | "cable"
  | "hybrid"
  | "internal"
  | "nfc"
  | "smart-card"
  | "usb";
