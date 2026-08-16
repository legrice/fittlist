import { desc, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { GroupsScreen } from "@/components/GroupsScreen";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const rows = await db
    .select({
      id: schema.groups.id,
      slug: schema.groups.slug,
      name: schema.groups.name,
      description: schema.groups.description,
      location: schema.groups.location,
      type: schema.groups.type,
      visibility: schema.groups.visibility,
      ownerUserId: schema.groups.ownerUserId,
      members: sql<number>`count(${schema.groupMembers.id})::int`,
      createdAt: schema.groups.createdAt,
    })
    .from(schema.groupMembers)
    .innerJoin(schema.groups, eq(schema.groups.id, schema.groupMembers.groupId))
    .where(eq(schema.groupMembers.userId, userId))
    .groupBy(schema.groups.id)
    .orderBy(desc(schema.groups.createdAt));

  return <main className="groups-page"><GroupsScreen groups={rows.map(({ ownerUserId, ...row }) => ({ ...row, owner: ownerUserId === userId }))} /></main>;
}
