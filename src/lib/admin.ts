import { eq, isNull } from "drizzle-orm";
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

/**
 * Open queues that need an admin decision. Reports are counted by the thing
 * being reported (rather than by reporter), and duplicate classes by the
 * conflicting time slot, so the header badge describes jobs to do.
 *
 * Callers must first establish that the viewer is an admin; keeping that check
 * in the shared app shell avoids another session and user lookup here.
 */
export async function adminAttentionCount(): Promise<number> {
  const db = await getDb();
  const [classReports, studioReports, suggestions, coachRequests, inviteRequests, classes] =
    await Promise.all([
      db.select({ seriesId: schema.classReports.seriesId }).from(schema.classReports),
      db.select({ studioId: schema.studioReports.studioId }).from(schema.studioReports),
      db.select({ id: schema.studioSuggestions.id }).from(schema.studioSuggestions),
      db
        .select({ id: schema.coachRequests.id })
        .from(schema.coachRequests)
        .where(isNull(schema.coachRequests.handledAt)),
      db
        .select({ id: schema.inviteRequests.id })
        .from(schema.inviteRequests)
        .where(isNull(schema.inviteRequests.handledAt)),
      db
        .select({
          studioId: schema.classes.studioId,
          dayOfWeek: schema.classes.dayOfWeek,
          startTime: schema.classes.startTime,
          userId: schema.classes.userId,
        })
        .from(schema.classes)
        .where(eq(schema.classes.isPublic, true)),
    ]);

  const duplicateSlots = new Map<string, Set<string>>();
  for (const cls of classes) {
    if (!cls.studioId) continue;
    const key = `${cls.studioId}|${cls.dayOfWeek}|${cls.startTime}`;
    const owners = duplicateSlots.get(key) ?? new Set<string>();
    owners.add(cls.userId);
    duplicateSlots.set(key, owners);
  }

  return (
    new Set(classReports.map((report) => report.seriesId)).size +
    new Set(studioReports.map((report) => report.studioId)).size +
    suggestions.length +
    coachRequests.length +
    inviteRequests.length +
    [...duplicateSlots.values()].filter((owners) => owners.size > 1).length
  );
}
