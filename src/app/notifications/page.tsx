import { redirect } from "next/navigation";

// Preserve the old address for links that already point at notification history.
export default function NotificationsPage() {
  redirect("/updates");
}
