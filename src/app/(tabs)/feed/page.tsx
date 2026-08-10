import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { buildDiscoverFeed } from "@/lib/discoverfeed";
import { avatarColor } from "@/lib/avatar";
import { FollowingScreen } from "@/components/FollowingScreen";
import { myWeek } from "@/lib/week";

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

  const [feed, weekDays] = await Promise.all([buildDiscoverFeed(userId, me), myWeek(userId)]);
  return (
    <FollowingScreen
      items={feed.items}
      coaches={feed.rail}
      favIds={feed.favIds}
      cats={feed.cats}
      follows={feed.follows}
      todayIso={feed.today}
      meId={userId}
      myRail={feed.myRail}
      weekPreview={weekDays.flatMap((day) => day.items).map((item) => ({
        key: item.id,
        iso: item.iso,
        name: item.name,
        hm: item.hm,
        ap: item.ap,
        where: item.where,
      }))}
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
