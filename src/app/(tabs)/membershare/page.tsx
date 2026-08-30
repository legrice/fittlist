import { hubPage } from "./hub";

export const dynamic = "force-dynamic";

// The Share tab is the week-image editor for everyone. A member also builds
// the week here: the hub is where they add the classes they're going to, and
// the picture is what the adding was for. The shared layout keeps route
// loading fast while the editor occupies the content above the app chrome.
//
export default async function MemberSharePage() {
  return hubPage("member");
}
