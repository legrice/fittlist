import { countDistinct, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";

// Who can reach /admin. Set ADMIN_EMAILS (comma-separated) explicitly in every
// hosted environment; local development retains the founder fallback.
export function adminEmails(): string[] {
  // A missing production allowlist grants nobody access. A compiled-in founder
  // address turns a configuration mistake into an authorization decision.
  const raw = process.env.ADMIN_EMAILS ?? (process.env.NODE_ENV === "production" ? "" : "mattlegrice@gmail.com");
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// The signed-in user if they're an admin, else null.
export async function currentAdmin(): Promise<{ id: string; email: string; look: string | null; adminActivityAt: Date | null } | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const db = await getDb();
  const [u] = await db
    .select({ id: schema.users.id, email: schema.users.email, look: schema.users.look, adminActivityAt: schema.users.adminActivityAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!u) return null;
  return adminEmails().includes(u.email.toLowerCase()) ? u : null;
}

/**
 * Unresolved reports only. Reports are counted by the thing being reported
 * rather than by reporter, so several reports about one listing produce one
 * admin badge item. Other admin queues remain visible inside /admin without
 * making the global header feel urgent.
 *
 * Callers must first establish that the viewer is an admin; keeping that check
 * in the shared app shell avoids another session and user lookup here.
 */
export async function adminAttentionCount(): Promise<number> {
  const db = await getDb();
  // Both badge sources are aggregates over tiny scalar answers. Keeping them
  // in one statement avoids a second database/network round trip on every
  // admin page render.
  const [row] = await db
    .select({
      classes: countDistinct(schema.classReports.seriesId),
      studios: sql<number>`(select count(distinct ${schema.studioReports.studioId}) from ${schema.studioReports})`,
      content: sql<number>`(select count(distinct (${schema.contentReports.contentType}, ${schema.contentReports.contentId})) from ${schema.contentReports} where ${schema.contentReports.status} = 'open')`,
    })
    .from(schema.classReports);

  return Number(row?.classes ?? 0) + Number(row?.studios ?? 0) + Number(row?.content ?? 0);
}
