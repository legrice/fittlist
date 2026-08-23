import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";

const INTERACTIVE_ROSTER_STATES = ["active", "invited"];

/** Private loader for callers that have already authenticated the viewer. */
export async function staffStudiosForUser(userId: string): Promise<
  { id: string; name: string; slug: string; admin: boolean; photo: string | null }[]
> {
  const db = await getDb();
  const [rostered, managed] = await Promise.all([
    db
      .select({ studioId: schema.studioRotaCoaches.studioId })
      .from(schema.studioRotaCoaches)
      .where(
        and(
          eq(schema.studioRotaCoaches.userId, userId),
          eq(schema.studioRotaCoaches.role, "coach"),
          eq(schema.studioRotaCoaches.onSchedule, true),
          inArray(schema.studioRotaCoaches.state, INTERACTIVE_ROSTER_STATES),
        ),
      ),
    db
      .select({ studioId: schema.studioManagers.studioId })
      .from(schema.studioManagers)
      .where(eq(schema.studioManagers.userId, userId)),
  ]);
  const runs = new Set(managed.map((row) => row.studioId));
  const ids = [...new Set([...rostered, ...managed].map((row) => row.studioId))];
  if (!ids.length) return [];
  const rows = await db
    .select({
      id: schema.studios.id,
      name: schema.studios.name,
      slug: schema.studios.slug,
      photo: schema.studios.photo,
    })
    .from(schema.studios)
    .where(inArray(schema.studios.id, ids));
  return rows
    .map((studio) => ({
      id: studio.id,
      name: studio.name,
      slug: studio.slug ?? studio.id,
      admin: runs.has(studio.id),
      photo: studio.photo,
    }))
    .sort((a, b) => Number(b.admin) - Number(a.admin) || a.name.localeCompare(b.name));
}
