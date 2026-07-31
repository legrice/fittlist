import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";

// Who can reach /admin. Set ADMIN_EMAILS (comma-separated) to override; defaults
// to the founder's address so the beta admin works with zero config.
export function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || "mattlegrice@gmail.com";
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
