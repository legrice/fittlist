import { loadCalendarShareData } from "@/app/actions/calendar-data";

export const dynamic = "force-dynamic";

/** Background reads must not compete with navigation in the server-action queue. */
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const data = await loadCalendarShareData();
    return Response.json(data, { status: data ? 200 : 401, headers });
  } catch {
    return Response.json({ error: "Share data is temporarily unavailable" }, { status: 503, headers });
  }
}
