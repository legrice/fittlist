import { cookies } from "next/headers";
import { siteOrigin } from "@/lib/format";

// WebAuthn / passkey plumbing shared by the auth actions. The Relying Party is
// derived from NEXT_PUBLIC_ORIGIN so it works on localhost and fittlist.co
// without extra config.

export const RP_NAME = "fittlist";

export function rpInfo(): { rpID: string; origin: string; rpName: string } {
  const origin = siteOrigin();
  const rpID = new URL(origin).hostname;
  return { rpID, origin, rpName: RP_NAME };
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
