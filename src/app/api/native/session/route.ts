import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

/** A resume check must distinguish expired authentication from a server outage. */
export async function GET() {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const userId = await getSessionUserId();
    return Response.json({ authenticated: !!userId }, { status: userId ? 200 : 401, headers });
  } catch {
    return Response.json({ unavailable: true }, { status: 503, headers });
  }
}
