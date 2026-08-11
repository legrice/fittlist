import { redirect } from "next/navigation";

// Preserve the old Messages address while giving conversations one home
// inside Updates. Individual thread URLs remain under /inbox/[id].
export default function InboxPage() {
  redirect("/updates?tab=messages");
}
