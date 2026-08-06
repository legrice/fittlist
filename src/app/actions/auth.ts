"use server";

import { createHash, randomBytes } from "crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
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
import { adminEmails } from "@/lib/admin";
import { nextAvatarColor } from "@/lib/avatar-server";
import { purgeUser } from "@/lib/purge";
import { sendMessage } from "@/lib/mailer";
import { createSession, destroySession, getSessionUserId } from "@/lib/session";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { pubKeyFromStore, pubKeyToStore, rpInfo, setChallenge, takeChallenge } from "@/lib/webauthn";
import { acceptInvite, INVITE_MSG, signupAllowed } from "@/lib/invites";
import { emailHtml } from "@/lib/email-html";
import { fansEnabled } from "@/lib/flags";
import { RESERVED_HANDLES, siteOrigin, slug } from "@/lib/format";
import { signupSource } from "@/lib/attribution";
import { pushSignupPing } from "@/lib/push";

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
): Promise<{
  ok: boolean;
  needsProfile?: boolean;
  hasPasskey?: boolean;
  fan?: boolean;
  /** The beta gate turned them away — callers can offer the waitlist instead. */
  needsInvite?: boolean;
  error?: string;
}> {
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "That doesn't look like an email address." };
  if (!password) return { ok: false, error: "Enter your password." };

  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));

  if (!user) {
    // No account yet: treat this as sign-up. The beta gate covers everyone —
    // members as much as coaches. Everything is in beta until it isn't, and a
    // member who joins now is exactly the feedback the beta is for.
    const fan = asFan && fansEnabled();
    if (!(await signupAllowed(email))) return { ok: false, needsInvite: true, error: INVITE_MSG };
    const problem = passwordProblem(password);
    if (problem) return { ok: false, error: problem };
    const passwordHash = await hashPassword(password);
    const [created] = await db
      .insert(schema.users)
      .values({ email, passwordHash, kind: fan ? "fan" : "coach", avatarColor: await nextAvatarColor(), signupSource: await signupSource() })
      .returning();
    pushSignupPing(email); // fire and forget; signup never waits on a ping
    await acceptInvite(email, created.id);
    await createSession(created.id);
    return { ok: true, needsProfile: true, hasPasskey: false, fan };
  }
  if (!user.passwordHash) {
    return {
      ok: false,
      error:
        "This account doesn't have a password yet. You signed in by email or with Google. " +
        "Tap “Forgot your password?” and we'll email you a link to get in and set one.",
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
    needsProfile: !user.handle,
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
  if (!userId) return { ok: false, error: "Session expired. Sign in again." };
  const problem = passwordProblem(newPassword);
  if (problem) return { ok: false, error: problem };
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) return { ok: false, error: "Session expired. Sign in again." };
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
  if (!userId) return { ok: false, error: "Session expired. Sign in again." };
  const email = newEmailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "That doesn't look like an email address." };
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) return { ok: false, error: "Session expired. Sign in again." };
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
  if (!existing && !(await signupAllowed(email))) return { ok: false, error: INVITE_MSG };

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
  const lines = [
    `You asked to sign in to fittlist as ${email}. Use the button below and you're in, no password needed.`,
    "The link works once and expires in 15 minutes. Once you're in you can set a password, so next time you can sign in on any browser without waiting on an email.",
  ];
  await sendMessage({
    to: email,
    kind: "magic_link",
    subject: "Sign in to fittlist",
    text: `${lines.join("\n\n")}\n\n${url}\n\nIf you didn't ask for this, you can ignore this email. Nothing has changed on your account.`,
    html: emailHtml({
      heading: "Sign in to fittlist",
      body: lines,
      cta: { label: "Sign in", url },
      footer: `This was sent to ${email} because someone asked to sign in to fittlist with that address. If it wasn't you, ignore it. Nothing has changed on the account.`,
    }),
  });
  return { ok: true };
}

// Consumed by the /auth/magic route handler. Returns null on a bad/expired
// token; otherwise creates the session and reports what to do next.
export async function consumeMagicToken(
  token: string,
): Promise<{
  needsProfile: boolean;
  fan: boolean;
  via: string | null;
  /** They can only get in by email right now — offer to fix that on arrival. */
  noPassword: boolean;
} | null> {
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
    if (!(await signupAllowed(row.email))) return null;
    [user] = await db
      .insert(schema.users)
      .values({ email: row.email, avatarColor: await nextAvatarColor(), signupSource: await signupSource() })
      .returning();
    pushSignupPing(row.email);
    await acceptInvite(row.email, user.id);
  }
  await createSession(user.id);
  const [pk] = await db
    .select({ id: schema.credentials.id })
    .from(schema.credentials)
    .where(eq(schema.credentials.userId, user.id));
  return {
    needsProfile: !user.handle,
    fan: user.kind === "fan",
    via: row.via,
    // An account with neither a password nor a passkey can only ever be reached
    // through this inbox. That's how someone ends up locked out of their own
    // page in a different browser, so offer the fix the moment they land.
    noPassword: !user.passwordHash && !pk,
  };
}

// ---- passkeys (WebAuthn): enroll while logged in, then sign in with biometrics
export async function beginPasskeyRegistration(): Promise<
  { ok: true; options: PublicKeyCredentialCreationOptionsJSON } | { ok: false; error: string }
> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) return { ok: false, error: "Sign in first." };
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
  if (!userId) return { ok: false, error: "Sign in first." };
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
  return { ok: true, needsProfile: !user.handle, fan: user.kind === "fan" };
}

// "I'm here to train." An account arriving by magic link is a coach by default
// — that's the column default, not a choice anyone made — so ask first. They
// still pick a name and a link afterwards: a member has a profile too, it just
// has no schedule behind it. Reversible from /you, which offers coaching.
export async function chooseFan(): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired. Sign in again." };
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return { ok: false, error: "Session expired. Sign in again." };
  // A claimed handle means they're already a coach with a live page; don't
  // quietly demote them.
  if (me.handle) return { ok: false, error: "You already have a page." };
  await db.update(schema.users).set({ kind: "fan" }).where(eq(schema.users.id, userId));
  return { ok: true };
}

// A member asking to post classes. It used to be a self-serve switch, and the
// switch is how ghost inventory got in: anyone could flip it and publish.
// Becoming a coach is an approval now; this files the ask and tells the admin,
// and adminSetKind is the only thing that flips the flag.
/**
 * "I teach too", the switch.
 *
 * Turning it on adds the Calendar tab and lists you in Discover. Turning it
 * off takes both away. Same account, same profile, no second signup: a coach
 * is not a different kind of person here, only somebody whose account carries
 * a calendar, and that is what makes this a decision rather than a migration.
 *
 * It used to be an ask. `requestCoaching` filed it and an admin answered on
 * the People tab, because public classes were coach-only and the wall was
 * holding back a real leak: beta members were recreating their gym's whole
 * schedule under their own name, since publishing was the only way to get a
 * week into the app at all. That motivation is gone with the member calendar,
 * and Matt's call is that converting should be one tap.
 *
 * The tradeoff is real and worth naming rather than discovering: anybody can
 * now declare themselves a coach and publish public classes, so the leak is
 * possible again. What catches it is the admin's Reports tab, which lists the
 * same studio and time under two accounts, and that is a cleanup rather than a
 * gate. `requestCoaching` and `adminAnswerCoachRequest` stay for the requests
 * already in flight.
 *
 * Turning it off is deliberately gentle: it never deletes a class. The tab
 * goes, the listing goes, and the week is still there if they turn it back on,
 * because a switch that quietly threw away somebody's work would be a switch
 * nobody could risk touching.
 */
export async function setTeaching(on: boolean): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired. Sign in again." };
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return { ok: false, error: "Session expired. Sign in again." };
  // A gym account is not a person and must never be flipped by one.
  if (me.kind === "gym") return { ok: false, error: "That is a studio account." };
  if (on && !me.handle) {
    return { ok: false, error: "Pick your link first, so your page has somewhere to live." };
  }
  await db
    .update(schema.users)
    .set({ kind: on ? "coach" : "fan", discoverable: on ? true : me.discoverable })
    .where(eq(schema.users.id, userId));
  revalidatePath("/you");
  revalidatePath("/calendar");
  revalidatePath("/feed");
  return { ok: true };
}

export async function requestCoaching(
  noteRaw = "",
): Promise<{ ok: boolean; pending?: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired. Sign in again." };
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return { ok: false, error: "Session expired. Sign in again." };
  if (me.kind !== "fan") return { ok: true }; // already a coach; nothing to ask
  if (!me.handle) {
    return { ok: false, error: "Set up your profile first, so your page has a link." };
  }
  const open = await db
    .select({ id: schema.coachRequests.id })
    .from(schema.coachRequests)
    .where(and(eq(schema.coachRequests.userId, userId), isNull(schema.coachRequests.handledAt)));
  if (open.length) return { ok: true, pending: true };

  await db.insert(schema.coachRequests).values({
    userId,
    note: noteRaw.trim().slice(0, 300),
  });
  // Tell whoever runs the place, in their Updates.
  try {
    const { feedbackHost } = await import("@/lib/feedback");
    const host = await feedbackHost();
    if (host) {
      const { addNotification } = await import("@/lib/notify");
      await addNotification(host.id, {
        type: "coach_request",
        title: "Wants to coach",
        body: `${me.name.trim() || me.email} asked to become a coach`,
        actorUserId: userId,
      });
    }
  } catch (err) {
    console.error("coach request notification failed", err);
  }
  return { ok: true, pending: true };
}

/** Is there an unanswered ask from this member? Drives the settings row copy. */
export async function coachRequestPending(): Promise<boolean> {
  const userId = await getSessionUserId();
  if (!userId) return false;
  const db = await getDb();
  const open = await db
    .select({ id: schema.coachRequests.id })
    .from(schema.coachRequests)
    .where(and(eq(schema.coachRequests.userId, userId), isNull(schema.coachRequests.handledAt)));
  return open.length > 0;
}

export async function claimProfile(
  nameRaw: string,
  handleRaw: string = "",
  via: string | null = null,
  /** What they're claiming it as. A coach gets a page with a schedule; a member
   *  gets the same link and profile without one. Defaults to coach, which is
   *  what the "post your own classes" path wants. */
  as: "coach" | "fan" = "coach",
): Promise<{ ok: boolean; handle?: string; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired. Sign in again." };
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
  // A member turning coach has already been through setup, but the member
  // version of it: no title, no contact details, no studios. Reopen it so the
  // coach steps actually run rather than being skipped as already done.
  const [before] = await db
    .select({ kind: schema.users.kind })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  const reopenSetup = as === "coach" && before?.kind === "fan";
  // Everyone gets a handle: it's their profile's address, not a coach badge.
  // `kind` is the thing that decides whether there's a schedule behind it,
  // where the app opens, and what chrome they get. A member who later posts
  // their own classes comes back through here as a coach and keeps everything.
  await db
    .update(schema.users)
    .set({
      name,
      handle: chosen,
      kind: as,
      ...(reopenSetup ? { onboardedAt: null } : {}),
      ...(signupSource ? { signupSource } : {}),
    })
    .where(eq(schema.users.id, userId));
  return { ok: true, handle: chosen };
}

export async function logout() {
  await destroySession();
  redirect("/");
}

/**
 * Delete your own account, and everything it owns.
 *
 * Session-derived and takes no id, deliberately: this is exported from a
 * `"use server"` file, so an id parameter would be an endpoint anybody could
 * post somebody else's account to. The same reasoning `myStaffStudios`
 * carries, with a great deal more at stake.
 *
 * Both app stores require an account this app let somebody create to be
 * deletable from inside it, which is why this exists rather than a note
 * asking people to write in. It runs the same teardown the admin panel does,
 * because the ordering of those deletes is load-bearing and a second copy
 * would rot.
 *
 * A gym's account has no login and so cannot arrive here, and the admin is
 * refused: this account is how a locked-out studio gets fixed, and deleting
 * it from a phone is not a thing to make one tap away.
 */
export async function deleteMyAccount(): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const db = await getDb();
  const [me] = await db
    .select({ email: schema.users.email, kind: schema.users.kind })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me) return { ok: false, error: "That account is already gone." };
  if (adminEmails().includes(me.email.toLowerCase()))
    return { ok: false, error: "An admin account can't be deleted from here." };
  if (me.kind === "gym")
    return { ok: false, error: "That's a studio's account. Remove the studio instead." };
  await purgeUser(db, userId);
  await destroySession();
  return { ok: true };
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
