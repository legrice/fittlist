import { and, eq, or, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { buildDiscoverFeed } from "@/lib/discoverfeed";
import { avatarColor } from "@/lib/avatar";
import { FollowingScreen } from "@/components/FollowingScreen";
import { managedCalendarsForUser } from "@/lib/managed-calendars";
import { visibleGroupFilter } from "@/lib/group-schedule";

export const dynamic = "force-dynamic";

// Discover: classes near you, your favorite coaches as a rail on top. The
// builder lives in discoverfeed.ts, shared with the Add screen's browse
// list, so the two can never disagree about what is near you.
export default async function DiscoverPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      kind: schema.users.kind,
      handle: schema.users.handle,
      location: schema.users.location,
      name: schema.users.name,
      photo: sql<string | null>`coalesce(${schema.users.photoThumb}, ${schema.users.photo})`,
      avatarColor: schema.users.avatarColor,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me) redirect("/");
  // The feed is the expensive branch. Studio saves, groups and pins are
  // independent, so don't make them wait for every schedule and occurrence
  // to finish before their first query even starts.
  const [feed, savedStudioRows, groupRows, pinRows, managedCalendars] = await Promise.all([
    // Stream later dates, but include every followed coach identity now.
    // The face row must not wait for the rest of the month to load.
    buildDiscoverFeed(userId, me, {
      calendarOnly: true,
      startDay: 0,
      endDay: 1,
    }),
    db.select({
      id: schema.studios.id,
      slug: schema.studios.slug,
      name: schema.studios.name,
      photo: schema.studios.photo,
    })
      .from(schema.studioEndorsements)
      .innerJoin(schema.studios, eq(schema.studios.id, schema.studioEndorsements.targetStudioId))
      .where(and(eq(schema.studioEndorsements.endorserUserId, userId), eq(schema.studioEndorsements.trait, "been_here"))),
    db.selectDistinct({ id: schema.groups.id, name: schema.groups.name, slug: schema.groups.slug, photo: schema.groups.photo })
        .from(schema.groups)
        .leftJoin(schema.groupMembers, eq(schema.groupMembers.groupId, schema.groups.id))
        .leftJoin(schema.groupFavorites, eq(schema.groupFavorites.groupId, schema.groups.id))
        .where(and(or(
          eq(schema.groups.ownerUserId, userId),
          eq(schema.groupMembers.userId, userId),
          eq(schema.groupFavorites.userId, userId),
        ), visibleGroupFilter(userId))),
    db.select({ entityType: schema.calendarPins.entityType, entityId: schema.calendarPins.entityId })
      .from(schema.calendarPins)
      .where(eq(schema.calendarPins.userId, userId)),
    managedCalendarsForUser(userId),
  ]);
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
        photo: me.photo,
        name: me.name ?? "",
        color: avatarColor(me),
      }}
      nearStudios={feed.nearStudios}
      savedStudios={savedStudioRows.map((studio) => ({
        id: studio.id,
        slug: studio.slug ?? studio.id,
        name: studio.name,
        photo: studio.photo,
        color: avatarColor({ id: studio.id }),
      }))}
      socialGroups={groupRows.map((group) => ({
        ...group,
        classKeys: [],
      }))}
      initialPins={pinRows.map((pin) => `${pin.entityType}:${pin.entityId}`)}
      managedCalendars={managedCalendars}
    />
  );
}
