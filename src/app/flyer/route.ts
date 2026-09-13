import { NextResponse, after } from "next/server";
import { getDb, schema } from "@/db";
import { sql } from "drizzle-orm";
import { looksLikeBot } from "@/lib/visits";
import { pushToAdmins } from "@/lib/push";
import { todayIso } from "@/lib/format";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  if (!looksLikeBot(req.headers.get("user-agent")) && !req.headers.has("next-router-prefetch") && req.headers.get("purpose") !== "prefetch" && !req.headers.get("sec-purpose")?.includes("prefetch")) {
    after(async () => {
      try {
        const db = await getDb();
        await db.insert(schema.flyerVisits).values({ date: todayIso(), count: 1 })
          .onConflictDoUpdate({ target: schema.flyerVisits.date, set: { count: sql`${schema.flyerVisits.count} + 1` } });
        await pushToAdmins({ title: "Town flyer opened", body: "Someone opened the town-flyer QR link.", url: "/admin?tab=activity" });
      } catch { console.error("Flyer visit could not be recorded"); }
    });
  }
  const response = NextResponse.redirect("https://www.fittlist.co/?utm_source=town_flyer&utm_medium=qr&utm_campaign=around_town", 307);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
