"use server";

import { and, count, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { myStaffStudios } from "@/app/actions/gym";
import type { YouDashboardData, YouFavoriteGroup, YouFavoritePerson, YouFavoritePlace } from "@/components/YouDashboard";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { adminEmails } from "@/lib/admin";
import { getSessionUserId } from "@/lib/session";
import { todayIso } from "@/lib/format";
import { unreadHeaderCounts } from "@/lib/notify";

/** The one data source for the standalone You page and its header sheet. */
export async function youDashboardData(): Promise<YouDashboardData | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me?.handle || !me.onboardedAt) return null;

  const [favoriteRows, placeRows, groupMembershipRows, ownedGroupRows, groupFavoriteRows, groupInvitationRows, managed, unread] = await Promise.all([
    db
      .select({ trainerUserId: schema.subscribers.trainerUserId })
      .from(schema.subscribers)
      .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt)))
      .orderBy(desc(schema.subscribers.createdAt)),
    db
      .select({ studioId: schema.studioEndorsements.targetStudioId })
      .from(schema.studioEndorsements)
      .where(and(
        eq(schema.studioEndorsements.endorserUserId, userId),
        eq(schema.studioEndorsements.trait, "been_here"),
      )),
    db
      .select({ groupId: schema.groupMembers.groupId, role: schema.groupMembers.role })
      .from(schema.groupMembers)
      .where(eq(schema.groupMembers.userId, userId)),
    db
      .select({ groupId: schema.groups.id })
      .from(schema.groups)
      .where(eq(schema.groups.ownerUserId, userId)),
    db
      .select({ groupId: schema.groupFavorites.groupId })
      .from(schema.groupFavorites)
      .where(eq(schema.groupFavorites.userId, userId)),
    db
      .select({ id: schema.groupInvitations.id, groupId: schema.groupInvitations.groupId, role: schema.groupInvitations.role, invitedByUserId: schema.groupInvitations.invitedByUserId })
      .from(schema.groupInvitations)
      .where(eq(schema.groupInvitations.inviteeUserId, userId)),
    myStaffStudios(),
    unreadHeaderCounts(userId, me.email),
  ]);

  const personIds = [...new Set(favoriteRows.map((row) => row.trainerUserId))]
    .filter((id) => id !== userId);
  const peopleData = personIds.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, personIds))
    : [];
  const peopleById = new Map(peopleData.map((person) => [person.id, person]));
  const people: YouFavoritePerson[] = personIds.flatMap((id) => {
    const person = peopleById.get(id);
    if (!person?.handle || person.kind === "gym") return [];
    return [{
      id: person.id,
      name: person.name.trim() || person.email.split("@")[0],
      handle: person.handle,
      photo: person.photoThumb ?? person.photo,
      color: avatarColor(person),
      title: person.title?.trim() ?? "",
    }];
  });

  const placeIds = [...new Set(placeRows.map((row) => row.studioId))];
  const placeData = placeIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, placeIds))
    : [];
  const places: YouFavoritePlace[] = placeData.map((place) => ({
    id: place.id,
    name: place.name,
    slug: place.slug ?? place.id,
    photo: place.photo,
    types: place.types,
  }));
  const membershipByGroup = new Map<string, string>([...ownedGroupRows.map((row) => [row.groupId, "owner"] as const), ...groupMembershipRows.map((row) => [row.groupId, row.role] as const)]);
  const groupIds = [...new Set([...groupMembershipRows, ...ownedGroupRows, ...groupFavoriteRows].map((row) => row.groupId))];
  const groupBaseRows = groupIds.length
    ? await db
        .select({ id: schema.groups.id, name: schema.groups.name, slug: schema.groups.slug, memberCount: count(schema.groupMembers.id) })
        .from(schema.groups)
        .leftJoin(schema.groupMembers, eq(schema.groupMembers.groupId, schema.groups.id))
        .where(inArray(schema.groups.id, groupIds))
        .groupBy(schema.groups.id, schema.groups.name, schema.groups.slug, schema.groups.createdAt)
        .orderBy(desc(schema.groups.createdAt))
    : [];
  const [groupMemberRows, groupClassRows] = groupIds.length ? await Promise.all([
    db.select({ groupId: schema.groupMembers.groupId, id: schema.users.id, name: schema.users.name, photo: schema.users.photoThumb, avatarColor: schema.users.avatarColor }).from(schema.groupMembers).innerJoin(schema.users, eq(schema.users.id, schema.groupMembers.userId)).where(inArray(schema.groupMembers.groupId, groupIds)),
    db.select({ groupId: schema.groupClasses.groupId, classId: schema.groupClasses.classId, iso: schema.groupClasses.occurrenceDate }).from(schema.groupClasses).where(and(inArray(schema.groupClasses.groupId, groupIds), gte(schema.groupClasses.occurrenceDate, todayIso()))),
  ]) : [[], []];
  const classIds = [...new Set(groupClassRows.map((row) => row.classId))];
  const groupClasses = classIds.length ? await db.select({ id: schema.classes.id, name: schema.classes.name }).from(schema.classes).where(inArray(schema.classes.id, classIds)) : [];
  const classById = new Map(groupClasses.map((item) => [item.id, item.name]));
  const groups: YouFavoriteGroup[] = groupBaseRows.map((group) => {
    const next = groupClassRows.filter((row) => row.groupId === group.id).sort((a, b) => a.iso.localeCompare(b.iso))[0];
    return {
      ...group,
      role: membershipByGroup.get(group.id) ?? null,
      nextClass: next ? classById.get(next.classId) ?? null : null,
      nextDate: next?.iso ?? null,
      faces: groupMemberRows.filter((row) => row.groupId === group.id).slice(0, 4).map((row) => ({ id: row.id, name: row.name, photo: row.photo, color: avatarColor(row) })),
    };
  });
  const invitedGroupIds = [...new Set(groupInvitationRows.map((row) => row.groupId))];
  const inviterIds = [...new Set(groupInvitationRows.map((row) => row.invitedByUserId))];
  const [invitedGroups, inviters] = await Promise.all([
    invitedGroupIds.length ? db.select({ id: schema.groups.id, name: schema.groups.name, slug: schema.groups.slug }).from(schema.groups).where(inArray(schema.groups.id, invitedGroupIds)) : [],
    inviterIds.length ? db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, inviterIds)) : [],
  ]);
  const invitedGroupById = new Map(invitedGroups.map((group) => [group.id, group]));
  const inviterById = new Map(inviters.map((person) => [person.id, person.name]));
  const groupInvitations = groupInvitationRows.flatMap((invite) => {
    const group = invitedGroupById.get(invite.groupId);
    return group ? [{ id: invite.id, name: group.name, slug: group.slug, role: invite.role, inviterName: inviterById.get(invite.invitedByUserId) ?? "A group admin" }] : [];
  });

  return {
    me: {
      name: me.name.trim() || me.email.split("@")[0],
      handle: me.handle,
      title: me.title?.trim() ?? "",
      location: me.location?.trim() ?? "",
      photo: me.photoThumb ?? me.photo,
      color: avatarColor(me),
      coaching: me.kind !== "fan",
    },
    people,
    places,
    yourGroups: groups.filter((group) => group.role),
    favoriteGroups: groups.filter((group) => !group.role),
    groupInvitations,
    managed: managed.filter((place) => place.admin),
    shareHref: me.kind === "fan" ? "/membershare" : "/coachshare",
    isAdmin: adminEmails().includes(me.email.toLowerCase()),
    unread,
  };
}
