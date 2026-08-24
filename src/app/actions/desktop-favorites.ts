"use server";

import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";

export type DesktopFavorite = {
  key: string;
  type: "person" | "studio";
  name: string;
  href: string;
  photo: string | null;
  color: string;
};

export type DesktopFollowBack = {
  id: string;
  name: string;
  handle: string;
  detail: string;
  photo: string | null;
  color: string;
  requested: boolean;
};

export type DesktopSidebarData = {
  favorites: DesktopFavorite[];
  followBack: DesktopFollowBack[];
};

const EMPTY: DesktopSidebarData = { favorites: [], followBack: [] };

/**
 * A deliberately small desktop-only projection. The persistent shell never
 * pulls in the discover directory or expands schedules: it resolves at most
 * eight pinned identities and five people who already follow the viewer.
 */
export async function desktopSidebarData(): Promise<DesktopSidebarData> {
  const userId = await getSessionUserId();
  if (!userId) return EMPTY;

  const db = await getDb();
  const [[me], pins, incoming] = await Promise.all([
    db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, userId)),
    db
      .select({
        entityType: schema.calendarPins.entityType,
        entityId: schema.calendarPins.entityId,
      })
      .from(schema.calendarPins)
      .where(eq(schema.calendarPins.userId, userId))
      .orderBy(desc(schema.calendarPins.createdAt))
      .limit(8),
    db
      .select({ email: schema.subscribers.email, createdAt: schema.subscribers.createdAt })
      .from(schema.subscribers)
      .where(
        and(
          eq(schema.subscribers.trainerUserId, userId),
          isNull(schema.subscribers.optedOutAt),
        ),
      )
      .orderBy(desc(schema.subscribers.createdAt))
      .limit(32),
  ]);
  if (!me) return EMPTY;

  const personIds = pins.filter((pin) => pin.entityType === "person").map((pin) => pin.entityId);
  const studioIds = pins.filter((pin) => pin.entityType === "studio").map((pin) => pin.entityId);
  const incomingEmails = [...new Set(incoming.map((row) => row.email))];

  const [people, studios, followerAccounts] = await Promise.all([
    personIds.length
      ? db
          .select({
            id: schema.users.id,
            name: schema.users.name,
            email: schema.users.email,
            handle: schema.users.handle,
            photo: sql<string | null>`coalesce(
              ${schema.users.photoThumb},
              case when ${schema.users.photo} not like 'data:%' then ${schema.users.photo} end
            )`,
            color: schema.users.avatarColor,
          })
          .from(schema.users)
          .where(inArray(schema.users.id, personIds))
      : Promise.resolve([]),
    studioIds.length
      ? db
          .select({
            id: schema.studios.id,
            name: schema.studios.name,
            slug: schema.studios.slug,
            photo: sql<string | null>`case
              when ${schema.studios.photo} not like 'data:%' then ${schema.studios.photo}
            end`,
          })
          .from(schema.studios)
          .where(inArray(schema.studios.id, studioIds))
      : Promise.resolve([]),
    incomingEmails.length
      ? db
          .select({
            id: schema.users.id,
            email: schema.users.email,
            name: schema.users.name,
            handle: schema.users.handle,
            location: schema.users.location,
            photo: sql<string | null>`coalesce(
              ${schema.users.photoThumb},
              case when ${schema.users.photo} not like 'data:%' then ${schema.users.photo} end
            )`,
            color: schema.users.avatarColor,
          })
          .from(schema.users)
          .where(inArray(schema.users.email, incomingEmails))
      : Promise.resolve([]),
  ]);

  const favoriteByKey = new Map<string, DesktopFavorite>();
  for (const person of people) {
    if (!person.handle) continue;
    const name = person.name.trim() || person.email.split("@")[0];
    favoriteByKey.set(`person:${person.id}`, {
      key: `person:${person.id}`,
      type: "person",
      name,
      href: `/${person.handle}`,
      photo: person.photo,
      color: person.color || "#D9D9D9",
    });
  }
  for (const studio of studios) {
    favoriteByKey.set(`studio:${studio.id}`, {
      key: `studio:${studio.id}`,
      type: "studio",
      name: studio.name,
      href: `/s/${studio.slug ?? studio.id}`,
      photo: studio.photo,
      color: "#E9ECE8",
    });
  }
  const favorites = pins
    .map((pin) => favoriteByKey.get(`${pin.entityType}:${pin.entityId}`))
    .filter((favorite): favorite is DesktopFavorite => !!favorite);

  const candidateIds = followerAccounts
    .filter((person) => person.id !== userId && !!person.handle)
    .map((person) => person.id);
  if (!candidateIds.length) return { favorites, followBack: [] };

  const [outgoing, requests, blocked] = await Promise.all([
    db
      .select({ trainerUserId: schema.subscribers.trainerUserId })
      .from(schema.subscribers)
      .where(
        and(
          eq(schema.subscribers.email, me.email),
          isNull(schema.subscribers.optedOutAt),
          inArray(schema.subscribers.trainerUserId, candidateIds),
        ),
      ),
    db
      .select({ trainerUserId: schema.followRequests.trainerUserId })
      .from(schema.followRequests)
      .where(
        and(
          eq(schema.followRequests.requesterUserId, userId),
          inArray(schema.followRequests.trainerUserId, candidateIds),
        ),
      ),
    db
      .select({ blockerUserId: schema.blocks.blockerUserId, blockedUserId: schema.blocks.blockedUserId })
      .from(schema.blocks)
      .where(
        or(
          and(eq(schema.blocks.blockerUserId, userId), inArray(schema.blocks.blockedUserId, candidateIds)),
          and(eq(schema.blocks.blockedUserId, userId), inArray(schema.blocks.blockerUserId, candidateIds)),
        ),
      ),
  ]);

  const alreadyFollowing = new Set(outgoing.map((row) => row.trainerUserId));
  const requested = new Set(requests.map((row) => row.trainerUserId));
  const blockedIds = new Set(
    blocked.map((row) => row.blockerUserId === userId ? row.blockedUserId : row.blockerUserId),
  );
  const order = new Map(incoming.map((row, index) => [row.email, index]));
  const followBack = followerAccounts
    .filter((person) =>
      person.id !== userId &&
      !!person.handle &&
      !alreadyFollowing.has(person.id) &&
      !blockedIds.has(person.id)
    )
    .sort((a, b) => (order.get(a.email) ?? 99) - (order.get(b.email) ?? 99))
    .slice(0, 5)
    .map((person) => ({
      id: person.id,
      name: person.name.trim() || person.email.split("@")[0],
      handle: person.handle!,
      detail: person.location?.trim() || `@${person.handle}`,
      photo: person.photo,
      color: person.color || "#D9D9D9",
      requested: requested.has(person.id),
    }));

  return { favorites, followBack };
}
