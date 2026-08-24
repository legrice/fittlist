"use server";

import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { mySchedule } from "@/lib/coachweek";
import { getSessionUserId } from "@/lib/session";

/** Studios attached to public classes this coach teaches. Embed setup only
 * needs this small identity list; saved and personal classes never enter it. */
export async function embedStudioOptions(): Promise<{ id: string; name: string }[]> {
  const userId = await getSessionUserId();
  if (!userId) return [];
  const classes = await mySchedule(userId);
  const studioIds = [...new Set(classes
    .filter((item) => item.isPublic)
    .map((item) => item.studioId)
    .filter((id): id is string => !!id))];
  if (!studioIds.length) return [];
  const db = await getDb();
  return db
    .select({ id: schema.studios.id, name: schema.studios.name })
    .from(schema.studios)
    .where(inArray(schema.studios.id, studioIds))
    .orderBy(schema.studios.name);
}
