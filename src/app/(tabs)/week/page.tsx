import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

// Your plans: the shortlist of classes you added, from today forward.
//
// It lives in the tabs group because it is the first tab. Outside it, tapping
// Plans would unmount the header and the bar and build a second copy of them,
// which is the whole reason that layout exists. The header, the tab bar and
// the dark-mode flag all come from the layout above this now.
//
// It loads the adder's ingredients too, because adding a class you go to is
// the same form as adding one you teach: the studio directory, your own saved
// classes, the shared type list.
export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ hl?: string; add?: string }>;
}) {
  // A coach's own calendar is /app, and the note that answers an add always
  // points here: the occurrence it wants highlighted has to survive the hop
  // or See it lands a coach at the top of their week with nothing marked.
  const { hl, add } = await searchParams;
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const params = new URLSearchParams();
  if (hl) params.set("hl", hl);
  if (add) params.set("add", add);
  redirect(`/calendar${params.size ? `?${params.toString()}` : ""}`);
}
