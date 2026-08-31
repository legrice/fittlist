import "server-only";

import { cache } from "react";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { staffStudiosForUser } from "@/lib/staff-studios";

export type ManagedCalendarDestination = {
  id: string;
  name: string;
  slug: string;
  kind: "studio" | "group";
  photo: string | null;
};

/** Calendars the viewer can actually manage, not every studio where they
 * happen to teach. This keeps the desktop switcher an ownership tool. */
export const managedCalendarsForUser = cache(async (userId: string): Promise<ManagedCalendarDestination[]> => {
  const db = await getDb();
  const [studios, memberGroups, ownedGroups] = await Promise.all([
    staffStudiosForUser(userId),
    db
      .select({ id: schema.groups.id, name: schema.groups.name, slug: schema.groups.slug, photo: schema.groups.photo })
      .from(schema.groupMembers)
      .innerJoin(schema.groups, eq(schema.groups.id, schema.groupMembers.groupId))
      .where(and(eq(schema.groupMembers.userId, userId), inArray(schema.groupMembers.role, ["owner", "admin"]))),
    db
      .select({ id: schema.groups.id, name: schema.groups.name, slug: schema.groups.slug, photo: schema.groups.photo })
      .from(schema.groups)
      .where(eq(schema.groups.ownerUserId, userId)),
  ]);

  const groups = [...new Map([...ownedGroups, ...memberGroups].map((group) => [group.id, group])).values()];
  return [
    ...studios.filter((studio) => studio.admin).map((studio) => ({ ...studio, kind: "studio" as const })),
    ...groups.map((group) => ({ ...group, kind: "group" as const })),
  ].sort((a, b) => a.name.localeCompare(b.name));
});
