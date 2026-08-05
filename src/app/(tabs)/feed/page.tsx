import { redirect } from "next/navigation";
import { landingHref } from "@/lib/flags";

export const dynamic = "force-dynamic";

// Following, parked.
//
// This was the member's front door for months: one merged week across every
// coach they followed, today first. It is gone because following stopped
// delivering a week. A follow puts a face at the top of Schedule now, and the
// classes behind that face reach a calendar only when somebody saves them,
// which is the whole thing this release is testing. A merged week sitting
// alongside that would answer the same question twice and answer it first,
// which is exactly why saving used to change nothing on screen.
//
// The route survives as a redirect rather than a 404 because it was the front
// door: it is in old emails, in bookmarks, in `?from=following` links out in
// the world, and on the home screen of anybody who installed the app while it
// was the landing. An old link has to land somewhere real.
//
// The screen itself is in git, at the commit that replaced it. If saves per
// member stay flat in the beta, brief two says the answer is a "New from your
// coaches" strip under the circles rather than bringing this back.
export default async function FeedPage() {
  redirect(await landingHref());
}
