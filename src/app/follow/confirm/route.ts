import { NextResponse } from "next/server";
import {
  EMAIL_FOLLOW_PENDING_COOKIE,
  EMAIL_FOLLOW_TOKEN_RE,
  EMAIL_FOLLOW_TTL_MS,
} from "@/lib/email-follow";
import { siteOrigin } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Mail scanners routinely open links before their recipient does. A GET only
 * parks the bearer token in an HttpOnly cookie; the clean continuation page's
 * explicit POST is the operation that confirms the follow.
 */
export function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const response = NextResponse.redirect(`${siteOrigin()}/follow/continue`, 303);
  response.cookies.set(EMAIL_FOLLOW_PENDING_COOKIE, EMAIL_FOLLOW_TOKEN_RE.test(token) ? token : "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: EMAIL_FOLLOW_TOKEN_RE.test(token) ? EMAIL_FOLLOW_TTL_MS / 1000 : 0,
    path: "/follow",
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
