import { redirect } from "next/navigation";

// Retired standalone account screen. Keep bookmarks and older app links on
// the current calendar, which owns the mobile profile and navigation tools.
export default function LegacyYouPage() {
  redirect("/calendar");
}
