import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/session";
import { myWeek } from "@/lib/week";
import { WeekScreen } from "@/components/WeekScreen";

export const dynamic = "force-dynamic";

// Your plans: the shortlist of classes you added, from today forward.
//
// It lives in the tabs group because it is the first tab. Outside it, tapping
// Plans would unmount the header and the bar and build a second copy of them,
// which is the whole reason that layout exists. The header, the tab bar and
// the dark-mode flag all come from the layout above this now.
export default async function WeekPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const days = await myWeek(userId);
  return <WeekScreen days={days} />;
}
