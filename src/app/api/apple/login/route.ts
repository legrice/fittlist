import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { appleAuthUrl, appleConfigured } from "@/lib/apple";
import { siteOrigin } from "@/lib/format";
import { sessionSecret } from "@/lib/secret";
import { APPLE_LOGIN_STATE_COOKIE } from "@/lib/oauth-state";

export const dynamic = "force-dynamic";

function secret() {
  return sessionSecret();
}

// "Continue with Apple" from the login screen. The signed state doubles as CSRF
// proof and carries the growth-loop attribution through to the claim step.
export async function GET(req: Request) {
  if (!appleConfigured()) return Response.redirect(`${siteOrigin()}/`, 302);
  const via = new URL(req.url).searchParams.get("via")?.trim().slice(0, 80) || "";
  const state = await new SignJWT({ aud: "apple-login", via })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setJti(randomBytes(24).toString("base64url"))
    .setExpirationTime("10m")
    .sign(secret());
  const response = NextResponse.redirect(appleAuthUrl(state), 302);
  // Apple's form_post callback is a cross-site POST, so this one cookie must
  // be SameSite=None. Secure is mandatory for that mode and Apple itself only
  // accepts HTTPS redirect URIs.
  response.cookies.set(APPLE_LOGIN_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/api/apple/callback",
    maxAge: 10 * 60,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
