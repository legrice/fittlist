import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { buildDiscoverFeed } from "@/lib/discoverfeed";
import { avatarColor } from "@/lib/avatar";
import { FollowingScreen } from "@/components/FollowingScreen";

export const dynamic = "force-dynamic";

// Discover: classes near you, your favorite coaches as a rail on top. The
// builder lives in discoverfeed.ts, shared with the Add screen's browse
// list, so the two can never disagree about what is near you.
export default async function DiscoverPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) redirect("/");

  const feed = await buildDiscoverFeed(userId, me);
  const existingRail = new Map(feed.myRail.map((person) => [person.id, person]));
  const activityPeople = new Map(
    feed.items.flatMap((item) => item.goers).map((person) => [person.id, person]),
  );
  const activityCoachIds = new Set(feed.items.map((item) => item.coachId));
  const activityRail = [
    ...feed.rail
      .filter((coach) => activityCoachIds.has(coach.id))
      .map((coach) => ({
        id: coach.id,
        name: coach.name,
        handle: coach.handle,
        photo: coach.photo,
        color: coach.color,
        fresh: existingRail.get(coach.id)?.fresh ?? false,
        nextAt: existingRail.get(coach.id)?.nextAt ?? null,
      })),
    ...[...activityPeople.values()]
      .filter((person) => !activityCoachIds.has(person.id) && person.id !== userId)
      .map((person) => ({ ...person, fresh: false, nextAt: null })),
  ];
  return (
    <FollowingScreen
      items={feed.items}
      coaches={feed.rail}
      favIds={feed.favIds}
      cats={feed.cats}
      follows={feed.follows}
      todayIso={feed.today}
      meId={userId}
      myRail={activityRail}
      meKind={me.kind === "fan" ? "member" : "coach"}
      meFace={{
        photo: me.photoThumb ?? me.photo,
        name: me.name ?? "",
        color: avatarColor(me),
      }}
      nearStudios={feed.nearStudios}
    />
  );
}
