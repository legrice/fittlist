import { and, eq, inArray, or } from "drizzle-orm";
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
  const [savedStudioRows, groupRows] = await Promise.all([
    db.select({ studioId: schema.studioEndorsements.targetStudioId })
      .from(schema.studioEndorsements)
      .where(and(eq(schema.studioEndorsements.endorserUserId, userId), eq(schema.studioEndorsements.trait, "been_here"))),
    db.select({ id: schema.groups.id, name: schema.groups.name, slug: schema.groups.slug, photo: schema.groups.photo })
      .from(schema.groups)
      .leftJoin(schema.groupMembers, eq(schema.groupMembers.groupId, schema.groups.id))
      .leftJoin(schema.groupFavorites, eq(schema.groupFavorites.groupId, schema.groups.id))
      .where(or(
        eq(schema.groups.ownerUserId, userId),
        eq(schema.groupMembers.userId, userId),
        eq(schema.groupFavorites.userId, userId),
      )),
  ]);
  const studioIds = [...new Set(savedStudioRows.map((row) => row.studioId))];
  const studios = studioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds))
    : [];
  const groupIds = [...new Set(groupRows.map((row) => row.id))];
  const groupClassRows = groupIds.length
    ? await db.select({ groupId: schema.groupClasses.groupId, classId: schema.groupClasses.classId, iso: schema.groupClasses.occurrenceDate })
      .from(schema.groupClasses)
      .where(inArray(schema.groupClasses.groupId, groupIds))
    : [];
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
      meKind={me.kind === "fan" ? "member" : "coach"}
      meFace={{
        photo: me.photoThumb ?? me.photo,
        name: me.name ?? "",
        color: avatarColor(me),
      }}
      nearStudios={feed.nearStudios}
      savedStudios={studios.map((studio) => ({
        id: studio.id,
        slug: studio.slug ?? studio.id,
        name: studio.name,
        photo: studio.photo,
        color: feed.nearStudios.find((item) => item.id === studio.id)?.color ?? "var(--color-surface-muted)",
      }))}
      socialGroups={groupRows.map((group) => ({
        ...group,
        classKeys: groupClassRows
          .filter((row) => row.groupId === group.id)
          .map((row) => `${row.classId}|${row.iso}`),
      }))}
    />
  );
}
