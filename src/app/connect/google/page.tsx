import { getSessionUserId } from "@/lib/session";
import { redirect } from "next/navigation";
import { googleConfigured } from "@/lib/gcal";

export const dynamic = "force-dynamic";

export default async function GoogleCalendarSetup() {
  if (!await getSessionUserId()) redirect("/?join=login&next=%2Fconnect%2Fgoogle");
  return <main className="screen"><div className="pad">
    <h1>Connect Google Calendar</h1>
    <p className="lead">Complete the connection in this browser, then tap Done to return to FittList. Your classes will sync to the same account.</p>
    {googleConfigured() ? (
      // eslint-disable-next-line @next/next/no-html-link-for-pages
      <a className="btn si" href="/api/google/connect">Continue to Google</a>
    ) : <p role="status">Google Calendar isn’t set up yet. You can still use your FittList calendar.</p>}
  </div></main>;
}
