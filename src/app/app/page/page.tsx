import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { MyPageScreen } from "@/components/MyPageScreen";

export const dynamic = "force-dynamic";

export default async function MyPage() {
  const userId = (await getSessionUserId())!;
  const db = await getDb();

  const [[user], [{ n: classCount }], [{ n: subsCount }]] = await Promise.all([
    db.select().from(schema.users).where(eq(schema.users.id, userId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.classes)
      .where(eq(schema.classes.userId, userId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.subscribers)
      .where(and(eq(schema.subscribers.trainerUserId, userId), isNull(schema.subscribers.optedOutAt))),
  ]);

  // Visit tracking is Phase 3; the stat renders zero until then.
  return (
    <MyPageScreen handle={user.handle!} visits={0} subsCount={subsCount} classCount={classCount} />
  );
}
