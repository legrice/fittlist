"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";

export async function createGroup(input: { name: string; memberIds: string[] }) {
  const ownerUserId = await getSessionUserId();
  if (!ownerUserId) return { ok: false, error: "Sign in to create a group." } as const;
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) return { ok: false, error: "Give your group a name." } as const;
  if (name.length > 60) return { ok: false, error: "Keep the name under 60 characters." } as const;

  const db = await getDb();
  const [owner] = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, ownerUserId));
  if (!owner) return { ok: false, error: "Account not found." } as const;
  const requestedIds = [...new Set(input.memberIds)].filter((id) => id !== ownerUserId).slice(0, 30);
  const allowedIds = requestedIds.length
    ? (await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .innerJoin(schema.subscribers, eq(schema.subscribers.trainerUserId, schema.users.id))
        .where(and(eq(schema.subscribers.email, owner.email), isNull(schema.subscribers.optedOutAt), inArray(schema.users.id, requestedIds))))
        .map((row) => row.id)
    : [];

  const group = await db.transaction(async (tx) => {
    const [created] = await tx.insert(schema.groups).values({ name, ownerUserId }).returning({ id: schema.groups.id });
    await tx.insert(schema.groupMembers).values([
      { groupId: created.id, userId: ownerUserId },
      ...allowedIds.map((userId) => ({ groupId: created.id, userId })),
    ]);
    return created;
  });
  revalidatePath("/saved");
  return { ok: true, id: group.id } as const;
}
