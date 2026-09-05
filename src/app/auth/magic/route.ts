import { NextResponse } from "next/server";
import { authOrigin } from "@/lib/auth-origin";
import { MAGIC_PENDING_COOKIE, MAGIC_PENDING_MAX_AGE } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Email clients and security products routinely preview links with GET. This
 * endpoint therefore performs no account mutation: it parks a well-formed,
 * short-lived token in an HttpOnly cookie and sends the browser to a clean
 * confirmation page. Only that page's explicit POST consumes the token.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const token = q.get("token") ?? "";
  const invited = q.get("invited") === "1";
  const origin = authOrigin();
  if (!/^[a-f0-9]{64}$/.test(token)) {
    const expired = NextResponse.redirect(`${origin}/?expired=1${invited ? "&invited=1" : ""}`, 303);
    expired.cookies.set(MAGIC_PENDING_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
      path: "/",
    });
    expired.headers.set("Cache-Control", "no-store");
    expired.headers.set("Referrer-Policy", "no-referrer");
    return expired;
  }
  const destination = new URL("/auth/continue", origin);
  if (invited) destination.searchParams.set("invited", "1");
  const response = NextResponse.redirect(destination, 303);
  response.cookies.set(MAGIC_PENDING_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAGIC_PENDING_MAX_AGE,
    path: "/",
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
