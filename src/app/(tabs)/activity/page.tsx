import { redirect } from "next/navigation";

/** Legacy social activity URL. Notifications is the maintained activity surface. */
export default function ActivityPage() {
  redirect("/notifications");
}
