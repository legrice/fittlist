import { redirect } from "next/navigation";

// The hub lived here first, and the tab pointed at it for a while, so the
// old address has to land: it is in histories and maybe a bookmark or two.
// The name changed by Matt's call; the screen did not.
export default function OldShareHub() {
  redirect("/share");
}
