import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";

// Who this person and the world have agreed on: follows in both directions.
// Extracted from myWeek so the social surfaces (also-going, the going-too
// notifications) can't drift from the one consent rule. Follows are keyed on
// email, so a follower who subscribed before having an account still counts
// once the address does.
export async function mutualIds(userId: string): Promise<Set<string>> {
  const db = await getDb();
  const [me] = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me) return new Set();
  const [iFollowRows, followMeRows] = await Promise.all([
    db
      .select({ trainerUserId: schema.subscribers.trainerUserId })
      .from(schema.subscribers)
      .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt))),
    db
      .select({ userId: schema.subscribers.userId, email: schema.subscribers.email })
      .from(schema.subscribers)
      .where(
        and(eq(schema.subscribers.trainerUserId, userId), isNull(schema.subscribers.optedOutAt)),
      ),
  ]);
  const iFollow = new Set(iFollowRows.map((r) => r.trainerUserId));
  const followerEmails = followMeRows.filter((r) => !r.userId).map((r) => r.email);
  const emailAccounts = followerEmails.length
    ? await db
        .select({ id: schema.users.id, email: schema.users.email })
        .from(schema.users)
        .where(inArray(schema.users.email, followerEmails))
    : [];
  const followMe = new Set([
    ...followMeRows.map((r) => r.userId).filter((id): id is string => !!id),
    ...emailAccounts.map((u) => u.id),
  ]);
  // Never yourself: a self-subscribe satisfies both directions at once.
  return new Set([...iFollow].filter((id) => id !== userId && followMe.has(id)));
}
