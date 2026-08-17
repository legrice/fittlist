import { hubPage } from "./hub";

export const dynamic = "force-dynamic";

// The Share tab's screen. Everyone gets the full sheet now, by Matt's call:
// Week, Profile, QR code and Text as segments, because a member's saved week
// is a real thing to share. A member also builds the week right here: the
// hub is where they add the classes they're going to, and the picture is
// what the adding was for. It lives in the tabs group so the bar stays under
// it; Share is a place you go, not a sheet that visits.
//
export default async function MemberSharePage() {
  return hubPage("member");
}
