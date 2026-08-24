"use server";

import { desc, inArray, sql } from "drizzle-orm";
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

/**
 * A deliberately tiny desktop-only projection. The persistent shell must not
 * pull in the discover directory or expand schedules just to decorate its
 * right rail, so it resolves at most eight already-favorited identities.
 */
export async function desktopCalendarFavorites(): Promise<DesktopFavorite[]> {
  const userId = await getSessionUserId();
  if (!userId) return [];

  const db = await getDb();
  const pins = await db
    .select({
      entityType: schema.calendarPins.entityType,
      entityId: schema.calendarPins.entityId,
    })
    .from(schema.calendarPins)
    .where(sql`${schema.calendarPins.userId} = ${userId}`)
    .orderBy(desc(schema.calendarPins.createdAt))
    .limit(8);

  const personIds = pins.filter((pin) => pin.entityType === "person").map((pin) => pin.entityId);
  const studioIds = pins.filter((pin) => pin.entityType === "studio").map((pin) => pin.entityId);

  const [people, studios] = await Promise.all([
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
  ]);

  const byKey = new Map<string, DesktopFavorite>();
  for (const person of people) {
    if (!person.handle) continue;
    const name = person.name.trim() || person.email.split("@")[0];
    byKey.set(`person:${person.id}`, {
      key: `person:${person.id}`,
      type: "person",
      name,
      href: `/${person.handle}`,
      photo: person.photo,
      color: person.color || "#D9D9D9",
    });
  }
  for (const studio of studios) {
    byKey.set(`studio:${studio.id}`, {
      key: `studio:${studio.id}`,
      type: "studio",
      name: studio.name,
      href: `/s/${studio.slug ?? studio.id}`,
      photo: studio.photo,
      color: "#E9ECE8",
    });
  }

  return pins
    .map((pin) => byKey.get(`${pin.entityType}:${pin.entityId}`))
    .filter((favorite): favorite is DesktopFavorite => !!favorite);
}
