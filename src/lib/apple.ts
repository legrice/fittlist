import { SignJWT, createRemoteJWKSet, importPKCS8, jwtVerify } from "jose";
import { createHash } from "node:crypto";
import { siteOrigin } from "@/lib/format";

// Sign in with Apple. Login only: Apple exposes no calendar API, so unlike
// Google this flow just identifies the trainer. Configured via four secrets
// from the Apple Developer portal:
//   APPLE_CLIENT_ID   the Services ID (e.g. co.fittlist.web)
//   APPLE_TEAM_ID     the 10-char Apple Team ID
//   APPLE_KEY_ID      the 10-char Key ID for the Sign in with Apple key
//   APPLE_PRIVATE_KEY the .p8 private key contents (PEM; \n-escaped is fine)

const AUTH = "https://appleid.apple.com/auth/authorize";
const TOKEN = "https://appleid.apple.com/auth/token";
const ISS = "https://appleid.apple.com";

export function appleConfigured(): boolean {
  return Boolean(
    process.env.APPLE_CLIENT_ID &&
      process.env.APPLE_TEAM_ID &&
      process.env.APPLE_KEY_ID &&
      process.env.APPLE_PRIVATE_KEY,
  );
}

export function appleRedirectUri(): string {
  return `${siteOrigin()}/api/apple/callback`;
}

export function appleAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.APPLE_CLIENT_ID!,
    redirect_uri: appleRedirectUri(),
    response_type: "code",
    scope: "name email",
    // Apple posts the result (needed to receive name/email), so the callback
    // is a POST rather than a redirect with query params.
    response_mode: "form_post",
    state,
  });
  return `${AUTH}?${p.toString()}`;
}

// Apple's "client secret" is a short-lived ES256 JWT signed with the .p8 key.
async function clientSecret(): Promise<string> {
  const pem = process.env.APPLE_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const key = await importPKCS8(pem, "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: process.env.APPLE_KEY_ID! })
    .setIssuer(process.env.APPLE_TEAM_ID!)
    .setIssuedAt()
    .setExpirationTime("5m")
    .setAudience(ISS)
    .setSubject(process.env.APPLE_CLIENT_ID!)
    .sign(key);
}

export async function appleExchange(code: string): Promise<{ id_token?: string; error?: string }> {
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.APPLE_CLIENT_ID!,
      client_secret: await clientSecret(),
      grant_type: "authorization_code",
      redirect_uri: appleRedirectUri(),
    }),
  });
  return res.json();
}

const JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

export type AppleIdentity = {
  subject: string;
  email: string | null;
};

export function nativeAppleAudience(): string {
  return process.env.APPLE_NATIVE_CLIENT_ID?.trim() || "co.fittlist.app";
}

export function appleNonceDigest(rawNonce: string): string {
  return createHash("sha256").update(rawNonce).digest("hex");
}

/** Verify Apple's signed identity token for either the web Services ID or the
 * native bundle ID. Native authorization also binds it to a server challenge. */
export async function appleIdentity(
  idToken: string | undefined,
  audience = process.env.APPLE_CLIENT_ID!,
  expectedNonce?: string,
): Promise<AppleIdentity | null> {
  if (!idToken || !audience) return null;
  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: ISS,
      audience,
    });
    if (!payload.sub) return null;
    if (expectedNonce && payload.nonce !== appleNonceDigest(expectedNonce)) return null;
    const emailVerified = payload.email_verified;
    if (payload.email && emailVerified !== undefined && emailVerified !== true && emailVerified !== "true")
      return null;
    return {
      subject: payload.sub,
      email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
    };
  } catch {
    return null;
  }
}

// Verify the id_token against Apple's public keys and return the email claim.
export async function appleEmail(idToken?: string): Promise<string | null> {
  return (await appleIdentity(idToken))?.email ?? null;
}
