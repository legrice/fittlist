import { redirect } from "next/navigation";

// The inbox list merged into the Updates screen's Messages tab; individual
// threads still live at /inbox/[id].
export default function InboxPage() {
  redirect("/updates?tab=messages");
}
