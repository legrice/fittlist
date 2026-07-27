import { redirect } from "next/navigation";

// Notifications merged into the Updates screen (with Messages) behind the bell.
export default function NotificationsPage() {
  redirect("/updates");
}
