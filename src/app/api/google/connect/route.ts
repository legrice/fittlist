import { SignJWT } from "jose";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { GOOGLE_CALENDAR_STATE_COOKIE } from "@/lib/oauth-state";
import { getSessionUserId } from "@/lib/session";
import { authUrl, googleConfigured } from "@/lib/gcal";
import { siteOrigin } from "@/lib/format";
import { sessionSecret } from "@/lib/secret";

export const dynamic = "force-dynamic";

function secret() {
  return sessionSecret();
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return Response.redirect(`${siteOrigin()}/`, 302);
  if (!googleConfigured()) {
    return Response.redirect(`${siteOrigin()}/app?gcal=unconfigured`, 302);
  }
  // The signature protects identity; the browser cookie binds consent to the
  // browser that started it. Signed state alone can be replayed in another tab.
  const state = await new SignJWT({ aud: "gcal", sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(randomBytes(24).toString("base64url"))
    .setExpirationTime("10m")
    .sign(secret());
  const response = NextResponse.redirect(authUrl(state), 302);
  response.cookies.set(GOOGLE_CALENDAR_STATE_COOKIE, state, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/api/google/callback", maxAge: 10 * 60,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
