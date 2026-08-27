import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

type Database = Awaited<ReturnType<typeof getDb>>;

/** A removed profile stays unpublished until an administrator deliberately
 * reverses the moderation record. Clearing the handle alone is not enough:
 * without this gate the same session could immediately claim it again. */
export async function profileRemovedByModeration(
  userId: string,
  database?: Database,
): Promise<boolean> {
  const db = database ?? await getDb();
  const [decision] = await db
    .select({ id: schema.contentReports.id })
    .from(schema.contentReports)
    .where(and(
      eq(schema.contentReports.contentType, "profile"),
      eq(schema.contentReports.contentId, userId),
      eq(schema.contentReports.status, "removed"),
    ))
    .limit(1);
  return !!decision;
}

export const PROFILE_REMOVED_MESSAGE =
  "Your public profile was removed after moderation. Contact support if you think this was a mistake.";
