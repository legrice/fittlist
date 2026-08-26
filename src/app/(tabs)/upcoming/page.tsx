import { redirect } from "next/navigation";

/** Legacy class-browser URL. Discover is the maintained browser. */
export default function UpcomingPage() {
  redirect("/discover");
}
