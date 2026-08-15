"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";

const clean = (value: string, max: number) => value.trim().replace(/\s+/g, " ").slice(0, max);

function slugBase(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 52) || "group";
}

export async function createGroup(input: {
  name: string;
  description?: string;
  location?: string;
  type?: string;
}) {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in to create a group." } as const;
  const name = clean(input.name, 70);
  if (name.length < 2) return { ok: false, error: "Give your group a name." } as const;

  const db = await getDb();
  const base = slugBase(name);
  let slug = base;
  for (let i = 0; i < 20; i += 1) {
    const [taken] = await db.select({ id: schema.groups.id }).from(schema.groups).where(eq(schema.groups.slug, slug));
    if (!taken) break;
    slug = `${base}-${i + 2}`;
  }

  const [group] = await db
    .insert(schema.groups)
    .values({
      slug,
      name,
      description: clean(input.description ?? "", 280),
      location: clean(input.location ?? "", 80),
      type: clean(input.type ?? "Community", 50) || "Community",
      ownerUserId: userId,
    })
    .returning({ id: schema.groups.id, slug: schema.groups.slug });
  await db.insert(schema.groupMembers).values({ groupId: group.id, userId, role: "owner" });
  revalidatePath("/groups");
  return { ok: true, slug: group.slug } as const;
}

export async function setGroupMembership(groupId: string, joining: boolean) {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in to join this group." } as const;
  const db = await getDb();
  const [group] = await db.select().from(schema.groups).where(eq(schema.groups.id, groupId));
  if (!group) return { ok: false, error: "That group is no longer here." } as const;
  if (!joining && group.ownerUserId === userId) {
    return { ok: false, error: "The person who created a group can’t leave it." } as const;
  }
  if (joining) {
    await db.insert(schema.groupMembers).values({ groupId, userId }).onConflictDoNothing();
  } else {
    await db.delete(schema.groupMembers).where(and(eq(schema.groupMembers.groupId, groupId), eq(schema.groupMembers.userId, userId)));
  }
  revalidatePath(`/g/${group.slug}`);
  revalidatePath("/groups");
  return { ok: true } as const;
}

export async function updateGroup(input: {
  id: string;
  name: string;
  description?: string;
  location?: string;
  type?: string;
}) {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in to manage this group." } as const;
  const db = await getDb();
  const [group] = await db.select().from(schema.groups).where(eq(schema.groups.id, input.id));
  if (!group || group.ownerUserId !== userId) return { ok: false, error: "Only the organizer can edit this group." } as const;
  const name = clean(input.name, 70);
  if (name.length < 2) return { ok: false, error: "Give your group a name." } as const;
  await db.update(schema.groups).set({
    name,
    description: clean(input.description ?? "", 280),
    location: clean(input.location ?? "", 80),
    type: clean(input.type ?? "Community", 50) || "Community",
  }).where(eq(schema.groups.id, input.id));
  revalidatePath(`/g/${group.slug}`);
  revalidatePath("/groups");
  return { ok: true } as const;
}

export async function deleteGroup(groupId: string) {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in to manage this group." } as const;
  const db = await getDb();
  const [group] = await db.select().from(schema.groups).where(eq(schema.groups.id, groupId));
  if (!group || group.ownerUserId !== userId) return { ok: false, error: "Only the organizer can delete this group." } as const;
  await db.delete(schema.groupMembers).where(eq(schema.groupMembers.groupId, groupId));
  await db.delete(schema.groups).where(eq(schema.groups.id, groupId));
  revalidatePath("/groups");
  return { ok: true } as const;
}
