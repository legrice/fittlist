import { hubPage } from "../membershare/hub";

export const dynamic = "force-dynamic";

// The coach's address for the one share hub. The screen lives with
// /membershare; this route only names it for the kind standing on it.
export default async function CoachSharePage() {
  return hubPage("coach");
}
