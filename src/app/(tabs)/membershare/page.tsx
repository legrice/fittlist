import { hubPage } from "./hub";

export const dynamic = "force-dynamic";

// The Share tab's screen. Everyone gets the full sheet now, by Matt's call:
// Week, Profile, QR code and Text as segments, because a member's saved week
// is a real thing to share. A member also builds the week right here: the
// hub is where they add the classes they're going to, and the picture is
// what the adding was for. The shared layout keeps route loading fast, while
// the hub takes over the full mobile viewport above the app chrome.
//
export default async function MemberSharePage() {
  return hubPage("member");
}
