import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { looksLikeBot, recordScheduleOpen } from "@/lib/visits";

// Beacon fired when a visitor opens a coach's Schedule tab. Counts one open per
// visit (the client fires it at most once). Owners and bots don't count.
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const db = await getDb();
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.handle, handle));
  if (!user) return new Response(null, { status: 204 });

  const viewerId = await getSessionUserId();
  if (viewerId !== user.id && !looksLikeBot(req.headers.get("user-agent"))) {
    try {
      await recordScheduleOpen(user.id);
    } catch (err) {
      console.error("schedule-open track failed", err);
    }
  }
  return new Response(null, { status: 204 });
}
