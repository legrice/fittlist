import { gymMonth, studioManagersForSettings, studioPageViews } from "@/app/actions/gym";

export const dynamic = "force-dynamic";

/** Background reads stay outside the router's server-action queue. Each reader
 * applies the same studio authorization used by its server-action callers. */
export async function GET(request: Request, { params }: { params: Promise<{ studioId: string }> }) {
  const { studioId } = await params;
  const query = new URL(request.url).searchParams;
  const headers = { "Cache-Control": "private, no-store" };
  try {
    switch (query.get("view")) {
      case "month": {
        const data = await gymMonth(studioId, query.get("month") ?? undefined);
        return Response.json(data, { status: data ? 200 : 404, headers });
      }
      case "managers":
        return Response.json(await studioManagersForSettings(studioId), { headers });
      case "views": {
        const data = await studioPageViews(studioId);
        return Response.json(data, { status: data.ok ? 200 : 403, headers });
      }
      default:
        return Response.json({ error: "Unknown studio view" }, { status: 400, headers });
    }
  } catch {
    return Response.json({ error: "Studio data is temporarily unavailable" }, { status: 503, headers });
  }
}
