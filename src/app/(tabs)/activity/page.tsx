import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { fansVisible } from "@/lib/flags";
import { activityFeed } from "@/lib/activity";
import { getSessionUserId } from "@/lib/session";
import { ActivityScreen } from "@/components/ActivityScreen";

export const dynamic = "force-dynamic";

// What the people you follow did lately, as a page of its own.
//
// It is deliberately not a tab. The four tabs are the places somebody lives;
// this is a thing you drop in on, so it hangs off the header's heartbeat and
// nothing else points at it. It also does not wait for Home: Home is
// dark-launched and this is finished, and holding a working screen behind an
// unfinished one helps nobody.
//
// It sits in the (tabs) group so the bar and header render once around it,
// the same reason /week moved in.
export default async function ActivityPage() {
  if (!(await fansVisible())) redirect("/");
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) redirect("/");
  // Uncapped, unlike Home's few: this is the page you came to for the lot.
  const items = await activityFeed(me, 200);
  return <ActivityScreen items={items} />;
}
