import { NextResponse } from "next/server";
import { consumeMagicToken } from "@/app/actions/auth";
import { landingHref } from "@/lib/flags";
import { siteOrigin } from "@/lib/format";

export const dynamic = "force-dynamic";

// A magic-link click lands here. Consume the token (which sets the session
// cookie), then send the trainer where they need to go: straight to the app, or
// back to the claim step if they haven't picked a handle yet.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const token = q.get("token") ?? "";
  const result = await consumeMagicToken(token);
  const origin = siteOrigin();
  if (!result) {
    // A dead invite link still means they were invited — keep that on the
    // landing page so they get "you're in", not "request an invite".
    const inv = q.get("invited") === "1" ? "&invited=1" : "";
    return NextResponse.redirect(`${origin}/?expired=1${inv}`);
  }
  // Signed in by email alone: prompt for a password so the next browser, or the
  // next device, isn't another trip through the inbox.
  const setpw = result.noPassword ? "?setpw=1" : "";
  if (result.needsProfile) {
    const q = result.via ? `?via=${encodeURIComponent(result.via)}` : "";
    return NextResponse.redirect(`${origin}/${q}`);
  }
  // Every established account lands on the same calendar. The calendar also
  // renders the set-a-password prompt when this login came from email.
  return NextResponse.redirect(`${origin}${await landingHref()}${setpw}`);
}
