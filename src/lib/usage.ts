import { and, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { type UsageKind } from "@/lib/beta-analytics";
/** One coarse signal per account/feature/UTC day. Concurrent duplicates do not affect distinct-user metrics. */
export async function recordUsage(userId: string, kind: UsageKind) {
  const db = await getDb();
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  const [seen] = await db.select({ id: schema.productActivity.id }).from(schema.productActivity)
    .where(and(eq(schema.productActivity.actorUserId, userId), eq(schema.productActivity.kind, kind), gte(schema.productActivity.createdAt, start))).limit(1);
  if (!seen) await db.insert(schema.productActivity).values({ actorUserId: userId, kind });
}
