import { redirect } from "next/navigation";

// Retired calendar entry point: keep bookmarks and history on Explore.
export default function LegacyFeedPage() {
  redirect("/calendar/following");
}
