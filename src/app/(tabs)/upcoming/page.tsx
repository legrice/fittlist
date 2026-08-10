import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { buildDiscoverFeed } from "@/lib/discoverfeed";
import { avatarColor } from "@/lib/avatar";
import { FollowingScreen } from "@/components/FollowingScreen";

export const dynamic = "force-dynamic";

// The complete class browser behind Home's single-day Upcoming preview. It uses
// the same feed builder and the same interactive list, so filters, saves and
// proximity never disagree between the two surfaces.
export default async function UpcomingPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) redirect("/");

  const feed = await buildDiscoverFeed(userId, me);
  return (
    <FollowingScreen
      mode="upcoming"
      items={feed.items}
      coaches={feed.rail}
      favIds={feed.favIds}
      cats={feed.cats}
      follows={feed.follows}
      todayIso={feed.today}
      meId={userId}
      myRail={[]}
      meKind={me.kind === "fan" ? "member" : "coach"}
      meFace={{
        photo: me.photoThumb ?? me.photo,
        name: me.name ?? "",
        color: avatarColor(me),
      }}
      nearStudios={[]}
      localCoaches={[]}
      hasCalendar={false}
    />
  );
}
