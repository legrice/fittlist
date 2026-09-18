import { USAGE_KINDS, type UsageKind } from "@/lib/beta-analytics";
import { getSessionUserId } from "@/lib/session";
import { recordUsage } from "@/lib/usage";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.includes("application/json")) return new Response(null, { status: 403, headers });
  try {
    const raw = await request.text();
    if (raw.length > 128) return new Response(null, { status: 400, headers });
    let input;
    try { input = JSON.parse(raw); } catch { return new Response(null, { status: 400, headers }); }
    if (!input || Object.keys(input).length !== 1 || !USAGE_KINDS.includes(input.kind)) return new Response(null, { status: 400, headers });
    const id = await getSessionUserId();
    if (!id) return new Response(null, { status: 401, headers });
    await recordUsage(id, input.kind as UsageKind);
    return new Response(null, { status: 204, headers });
  } catch { return new Response(null, { status: 503, headers }); }
}
