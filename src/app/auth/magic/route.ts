import { NextResponse } from "next/server";
import { consumeMagicToken } from "@/app/actions/auth";
import { siteOrigin } from "@/lib/format";

export const dynamic = "force-dynamic";

// A magic-link click lands here. Consume the token (which sets the session
// cookie), then send the trainer where they need to go: straight to the app, or
// back to the claim step if they haven't picked a handle yet.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const result = await consumeMagicToken(token);
  const origin = siteOrigin();
  if (!result) {
    return NextResponse.redirect(`${origin}/?expired=1`);
  }
  if (result.fan) {
    return NextResponse.redirect(`${origin}/feed`);
  }
  if (result.needsProfile) {
    const q = result.via ? `?via=${encodeURIComponent(result.via)}` : "";
    return NextResponse.redirect(`${origin}/${q}`);
  }
  return NextResponse.redirect(`${origin}/app`);
}
