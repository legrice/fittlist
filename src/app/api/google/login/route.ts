import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { authUrlLogin, googleConfigured } from "@/lib/gcal";
import { siteOrigin } from "@/lib/format";
import { sessionSecret } from "@/lib/secret";
import { GOOGLE_LOGIN_STATE_COOKIE } from "@/lib/oauth-state";

export const dynamic = "force-dynamic";

function secret() {
  return sessionSecret();
}

// "Continue with Google" from the login screen. No session yet; the signed
// state marks this as a login (vs the calendar-connect flow) and carries the
// growth-loop attribution through to the claim step.
export async function GET(req: Request) {
  if (!googleConfigured()) return Response.redirect(`${siteOrigin()}/`, 302);
  const via = new URL(req.url).searchParams.get("via")?.trim().slice(0, 80) || "";
  const state = await new SignJWT({ aud: "google-login", via })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setJti(randomBytes(24).toString("base64url"))
    .setExpirationTime("10m")
    .sign(secret());
  const response = NextResponse.redirect(authUrlLogin(state), 302);
  response.cookies.set(GOOGLE_LOGIN_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/google/callback",
    maxAge: 10 * 60,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
