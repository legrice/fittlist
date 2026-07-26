import { cookies, headers } from "next/headers";
import { siteOrigin } from "@/lib/format";

// WebAuthn / passkey plumbing shared by the auth actions. The Relying Party ID
// and origin MUST match the domain the browser is actually on, or the
// authenticator refuses (SecurityError) / verification fails. We derive them
// from the incoming request host so passkeys work regardless of how
// NEXT_PUBLIC_ORIGIN is configured (custom domain, preview URL, localhost),
// falling back to the configured origin only if no host header is present.

export const RP_NAME = "fittlist";

export async function rpInfo(): Promise<{ rpID: string; origin: string; rpName: string }> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  if (host) {
    const hostname = host.split(":")[0];
    const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
    const proto =
      (h.get("x-forwarded-proto") ?? "").split(",")[0].trim() || (isLocal ? "http" : "https");
    return { rpID: hostname, origin: `${proto}://${host}`, rpName: RP_NAME };
  }
  const origin = siteOrigin();
  return { rpID: new URL(origin).hostname, origin, rpName: RP_NAME };
}

// The registration/authentication challenge lives in a short-lived, httpOnly
// cookie between the two round trips of a ceremony (single-use, low value).
const CHALLENGE_COOKIE = "fl_wa_chal";

export async function setChallenge(challenge: string): Promise<void> {
  const jar = await cookies();
  jar.set(CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 300,
    path: "/",
  });
}

export async function takeChallenge(): Promise<string | null> {
  const jar = await cookies();
  const val = jar.get(CHALLENGE_COOKIE)?.value ?? null;
  jar.set(CHALLENGE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
  return val;
}

// Public keys are stored base64; the verifier wants raw bytes.
export function pubKeyToStore(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
export function pubKeyFromStore(b64: string): Uint8Array<ArrayBuffer> {
  // Copy into a fresh ArrayBuffer-backed view (not the pooled Buffer's) so the
  // type matches what the verifier expects.
  return Uint8Array.from(Buffer.from(b64, "base64"));
}
