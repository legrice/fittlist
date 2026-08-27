import { jwtVerify } from "jose";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb, schema } from "@/db";
import { nextAvatarColor } from "@/lib/avatar-server";
import {
  appleIdentity,
  appleNonceDigest,
  nativeAppleAudience,
} from "@/lib/apple";
import { signupSource } from "@/lib/attribution";
import { fansEnabled, landingHref } from "@/lib/flags";
import { acceptInvite, signupAllowed } from "@/lib/invites";
import { pushSignupPing } from "@/lib/push";
import { claimRosterPlaceholders } from "@/lib/roster";
import { sessionSecret } from "@/lib/secret";
import { createSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const APPLE_NATIVE_CHALLENGE_COOKIE = "fl_apple_native_challenge";

const responseHeaders = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

const fail = (status = 400, code = "apple_auth_failed") =>
  Response.json({ ok: false, error: code }, { status, headers: responseHeaders });

export async function POST(req: Request) {
  const requestOrigin = new URL(req.url).origin;
  const origin = req.headers.get("origin");
  if (origin && origin !== requestOrigin) return fail(403);

  const jar = await cookies();
  const grant = jar.get(APPLE_NATIVE_CHALLENGE_COOKIE)?.value;
  jar.set(APPLE_NATIVE_CHALLENGE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/apple/native",
    maxAge: 0,
  });
  if (!grant) return fail();

  let nonce = "";
  let via = "";
  let challengeId = "";
  try {
    const { payload } = await jwtVerify(grant, sessionSecret());
    if (
      payload.aud !== "apple-native-challenge" ||
      typeof payload.nonce !== "string" ||
      typeof payload.challengeId !== "string"
    )
      return fail();
    nonce = payload.nonce;
    via = typeof payload.via === "string" ? payload.via : "";
    challengeId = payload.challengeId;
  } catch {
    return fail();
  }
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(challengeId)) return fail();

  const db = await getDb();
  const [consumed] = await db
    .update(schema.appleNativeChallenges)
    .set({ consumedAt: new Date() })
    .where(and(
      eq(schema.appleNativeChallenges.id, challengeId),
      eq(schema.appleNativeChallenges.nonceHash, appleNonceDigest(nonce)),
      isNull(schema.appleNativeChallenges.consumedAt),
      gt(schema.appleNativeChallenges.expiresAt, new Date()),
    ))
    .returning({ id: schema.appleNativeChallenges.id });
  if (!consumed) return fail();

  let body: { identityToken?: string; givenName?: string; familyName?: string };
  try {
    body = await req.json();
  } catch {
    return fail();
  }
  if (!body.identityToken || body.identityToken.length > 12_000) return fail();
  const identity = await appleIdentity(body.identityToken, nativeAppleAudience(), nonce);
  if (!identity) return fail();

  const [linked] = await db
    .select({ userId: schema.appleIdentities.userId })
    .from(schema.appleIdentities)
    .where(eq(schema.appleIdentities.subject, identity.subject));
  let [user] = linked
    ? await db.select().from(schema.users).where(eq(schema.users.id, linked.userId))
    : identity.email
      ? await db.select().from(schema.users).where(eq(schema.users.email, identity.email))
      : [];

  if (!user) {
    const email = identity.email;
    if (!email) return fail();
    if (!(await signupAllowed(email))) return fail(403, "invite_required");
    const name = [body.givenName, body.familyName]
      .map((part) => part?.trim().replace(/\s+/g, " ") ?? "")
      .filter(Boolean)
      .join(" ")
      .slice(0, 80);
    [user] = await db
      .insert(schema.users)
      .values({
        email,
        name,
        kind: fansEnabled() ? "fan" : "coach",
        discoverable: false,
        avatarColor: await nextAvatarColor(),
        signupSource: await signupSource(),
      })
      .returning();
    pushSignupPing(email);
    await acceptInvite(email, user.id);
    await claimRosterPlaceholders(email, user.id);
    [user] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
  }

  await db
    .insert(schema.appleIdentities)
    .values({ subject: identity.subject, userId: user.id, email: identity.email })
    .onConflictDoUpdate({
      target: schema.appleIdentities.subject,
      set: { userId: user.id, email: identity.email, updatedAt: new Date() },
    });
  await createSession(user.id);
  const href = user.handle ? await landingHref() : via ? `/?via=${encodeURIComponent(via)}` : "/";
  return Response.json({ ok: true, href }, { headers: responseHeaders });
}
