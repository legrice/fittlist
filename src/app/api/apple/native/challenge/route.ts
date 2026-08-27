import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { cookies } from "next/headers";
import { lt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { appleNonceDigest } from "@/lib/apple";
import { sessionSecret } from "@/lib/secret";

export const dynamic = "force-dynamic";

const APPLE_NATIVE_CHALLENGE_COOKIE = "fl_apple_native_challenge";

const responseHeaders = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

export async function POST(req: Request) {
  const requestOrigin = new URL(req.url).origin;
  const origin = req.headers.get("origin");
  if (origin && origin !== requestOrigin)
    return Response.json({ ok: false }, { status: 403, headers: responseHeaders });

  const nonce = randomBytes(32).toString("base64url");
  const via = new URL(req.url).searchParams.get("via")?.trim().slice(0, 80) || "";
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  const db = await getDb();
  await db.delete(schema.appleNativeChallenges).where(lt(schema.appleNativeChallenges.expiresAt, new Date()));
  const [challenge] = await db
    .insert(schema.appleNativeChallenges)
    .values({ nonceHash: appleNonceDigest(nonce), expiresAt })
    .returning({ id: schema.appleNativeChallenges.id });
  const grant = await new SignJWT({ aud: "apple-native-challenge", nonce, via, challengeId: challenge.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(sessionSecret());
  (await cookies()).set(APPLE_NATIVE_CHALLENGE_COOKIE, grant, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/apple/native",
    maxAge: 5 * 60,
  });
  return Response.json({ ok: true, nonce }, { headers: responseHeaders });
}
