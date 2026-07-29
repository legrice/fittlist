import { NextResponse } from "next/server";
import { inviterByCode, rememberJoin } from "@/lib/joinlink";
import { siteOrigin } from "@/lib/format";

export const dynamic = "force-dynamic";

// Somebody opened a share link. Remember whose it was and put them on the front
// door, which reads the same cookie and says who sent them.
//
// A route handler rather than a page, because setting a cookie during a Server
// Component render throws. Nothing is created here: the link is an invitation,
// not an account.
//
// A code that means nothing lands on the front door anyway, with no cookie.
// Saying "that link is invalid" to someone who was handed a link by a friend
// gets us nothing, and the signup form will tell them if they still can't get
// in.
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const inviter = await inviterByCode(code);
  if (inviter) await rememberJoin(code.trim().toLowerCase());
  return NextResponse.redirect(`${siteOrigin()}/`, { status: 302 });
}
