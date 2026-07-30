import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// First-touch attribution, first-party only. The first page view with a
// readable referrer or a tagged link writes one cookie; signup copies it onto
// the account and it never goes anywhere else. This is the whole analytics
// stack on purpose: where people come from is a fact about the link, not a
// dossier on the person, and nothing here is sent to a third party.
const KNOWN: Record<string, string> = {
  "l.instagram.com": "instagram.com",
  "lm.facebook.com": "facebook.com",
  "l.facebook.com": "facebook.com",
  "t.co": "twitter.com",
  "out.reddit.com": "reddit.com",
};

export function middleware(req: NextRequest) {
  if (req.cookies.has("fl_src")) return NextResponse.next();

  const url = req.nextUrl;
  const parts: string[] = [];
  const ref = req.headers.get("referer");
  if (ref) {
    try {
      let host = new URL(ref).hostname.toLowerCase().replace(/^www\./, "");
      host = KNOWN[host] ?? host;
      if (host && host !== url.hostname) parts.push(host);
    } catch {
      /* an unparseable referer is the same as none */
    }
  }
  const utm = url.searchParams.get("utm_source");
  if (utm) parts.push(`utm:${utm.slice(0, 40)}`);
  const via = url.searchParams.get("via");
  if (via) parts.push(`via:${via.slice(0, 40)}`);
  if (parts.length === 0) return NextResponse.next();

  const res = NextResponse.next();
  res.cookies.set("fl_src", parts.join(" · ").slice(0, 120), {
    maxAge: 60 * 60 * 24 * 30,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}

export const config = {
  // Pages only: assets and API routes can't be anyone's first touch.
  matcher: ["/((?!_next|api|fonts|.*\\..*).*)"],
};
