import { and, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { buildDiscoverFeed } from "@/lib/discoverfeed";
import { avatarColor } from "@/lib/avatar";
import { FollowingScreen } from "@/components/FollowingScreen";
import { todayIso } from "@/lib/format";
import { managedCalendarsForUser } from "@/lib/managed-calendars";
import { unreadHeaderCounts } from "@/lib/notify";

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
  const today = todayIso();
  const throughDate = new Date(`${today}T00:00:00Z`);
  throughDate.setUTCDate(throughDate.getUTCDate() + 30);
  const through = throughDate.toISOString().slice(0, 10);

  // The feed is the expensive branch. Studio saves, groups and pins are
  // independent, so don't make them wait for every schedule and occurrence
  // to finish before their first query even starts.
  const [feed, savedStudioRows, groupData, pinRows, managedCalendars, unread] = await Promise.all([
    // First paint is deliberately only today + tomorrow and the visible
    // portion of the rail. The remaining exact 31-day calendar streams from
    // the client after this page is already usable.
    buildDiscoverFeed(userId, me, {
      calendarOnly: true,
      startDay: 0,
      endDay: 1,
      initialRailLimit: 16,
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
    (async () => {
      const rows = await db.selectDistinct({ id: schema.groups.id, name: schema.groups.name, slug: schema.groups.slug, photo: schema.groups.photo })
        .from(schema.groups)
        .leftJoin(schema.groupMembers, eq(schema.groupMembers.groupId, schema.groups.id))
        .leftJoin(schema.groupFavorites, eq(schema.groupFavorites.groupId, schema.groups.id))
        .where(or(
          eq(schema.groups.ownerUserId, userId),
          eq(schema.groupMembers.userId, userId),
          eq(schema.groupFavorites.userId, userId),
        ));
      const ids = rows.map((row) => row.id);
      const classRows = ids.length
        ? await db.select({ groupId: schema.groupClasses.groupId, classId: schema.groupClasses.classId, iso: schema.groupClasses.occurrenceDate })
          .from(schema.groupClasses)
          .where(and(
            inArray(schema.groupClasses.groupId, ids),
            gte(schema.groupClasses.occurrenceDate, today),
            lte(schema.groupClasses.occurrenceDate, through),
          ))
        : [];
      return { rows, classRows };
    })(),
    db.select({ entityType: schema.calendarPins.entityType, entityId: schema.calendarPins.entityId })
      .from(schema.calendarPins)
      .where(eq(schema.calendarPins.userId, userId)),
    managedCalendarsForUser(userId),
    unreadHeaderCounts(userId, me.email),
  ]);
  const classKeysByGroup = new Map<string, string[]>();
  for (const row of groupData.classRows) {
    const keys = classKeysByGroup.get(row.groupId) ?? [];
    keys.push(`${row.classId}|${row.iso}`);
    classKeysByGroup.set(row.groupId, keys);
  }
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
      socialGroups={groupData.rows.map((group) => ({
        ...group,
        classKeys: classKeysByGroup.get(group.id) ?? [],
      }))}
      initialPins={pinRows.map((pin) => `${pin.entityType}:${pin.entityId}`)}
      managedCalendars={managedCalendars}
      unread={unread.notifications > 0 || unread.messages > 0}
    />
  );
}
