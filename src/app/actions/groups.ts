"use server";

import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
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
  visibility?: "public" | "private";
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
      visibility: input.visibility === "private" ? "private" : "public",
      inviteToken: randomUUID().replaceAll("-", ""),
      ownerUserId: userId,
    })
    .returning({ id: schema.groups.id, slug: schema.groups.slug });
  await db.insert(schema.groupMembers).values({ groupId: group.id, userId, role: "owner" });
  revalidatePath("/groups");
  return { ok: true, slug: group.slug } as const;
}

export async function setGroupMembership(groupId: string, joining: boolean, inviteToken?: string) {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in to join this group." } as const;
  const db = await getDb();
  const [group] = await db.select().from(schema.groups).where(eq(schema.groups.id, groupId));
  if (!group) return { ok: false, error: "That group is no longer here." } as const;
  if (!joining && group.ownerUserId === userId) {
    return { ok: false, error: "The person who created a group can’t leave it." } as const;
  }
  if (joining && group.visibility === "private" && inviteToken !== group.inviteToken) {
    return { ok: false, error: "This private group needs a valid invite." } as const;
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

export async function setGroupShareMode(groupId: string, mode: "selected" | "public-week") {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in to change what you share." } as const;
  const db = await getDb();
  const [membership] = await db.select().from(schema.groupMembers).where(and(eq(schema.groupMembers.groupId, groupId), eq(schema.groupMembers.userId, userId)));
  if (!membership) return { ok: false, error: "Join the group before sharing with it." } as const;
  await db.update(schema.groupMembers).set({ shareMode: mode }).where(eq(schema.groupMembers.id, membership.id));
  const [group] = await db.select({ slug: schema.groups.slug }).from(schema.groups).where(eq(schema.groups.id, groupId));
  if (group) revalidatePath(`/g/${group.slug}`);
  return { ok: true } as const;
}

export async function shareClassWithGroups(classId: string, groupIds: string[]) {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in to share a class." } as const;
  const db = await getDb();
  const [row] = await db.select({ owner: schema.classes.userId, seriesId: schema.classes.seriesId })
    .from(schema.classes).where(eq(schema.classes.id, classId));
  if (!row || row.owner !== userId) return { ok: false, error: "That class is not on your teaching schedule." } as const;
  const wanted = [...new Set(groupIds.filter(Boolean))];
  if (!wanted.length) return { ok: true } as const;
  const memberships = await db.select({ groupId: schema.groupMembers.groupId })
    .from(schema.groupMembers)
    .where(and(eq(schema.groupMembers.userId, userId), inArray(schema.groupMembers.groupId, wanted)));
  if (!memberships.length) return { ok: false, error: "Join a group before posting to it." } as const;
  await db.insert(schema.groupClassShares).values(memberships.map(({ groupId }) => ({ groupId, userId, seriesId: row.seriesId }))).onConflictDoNothing();
  for (const { groupId } of memberships) {
    const [group] = await db.select({ slug: schema.groups.slug }).from(schema.groups).where(eq(schema.groups.id, groupId));
    if (group) revalidatePath(`/g/${group.slug}`);
  }
  return { ok: true } as const;
}

export async function shareTeachingSeriesWithGroup(groupId: string, seriesId: string) {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in to add to this group." } as const;
  const db = await getDb();
  const [membership] = await db.select({ id: schema.groupMembers.id }).from(schema.groupMembers)
    .where(and(eq(schema.groupMembers.groupId, groupId), eq(schema.groupMembers.userId, userId)));
  const [owned] = await db.select({ id: schema.classes.id }).from(schema.classes)
    .where(and(eq(schema.classes.seriesId, seriesId), eq(schema.classes.userId, userId)));
  if (!membership || !owned) return { ok: false, error: "That class cannot be added here." } as const;
  await db.insert(schema.groupClassShares).values({ groupId, userId, seriesId }).onConflictDoNothing();
  const [group] = await db.select({ slug: schema.groups.slug }).from(schema.groups).where(eq(schema.groups.id, groupId));
  if (group) revalidatePath(`/g/${group.slug}`);
  return { ok: true } as const;
}

export async function updateGroup(input: {
  id: string;
  name: string;
  description?: string;
  location?: string;
  type?: string;
  visibility?: "public" | "private";
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
    visibility: input.visibility === "private" ? "private" : "public",
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
  await db.delete(schema.groupClassShares).where(eq(schema.groupClassShares.groupId, groupId));
  await db.delete(schema.groupMembers).where(eq(schema.groupMembers.groupId, groupId));
  await db.delete(schema.groups).where(eq(schema.groups.id, groupId));
  revalidatePath("/groups");
  return { ok: true } as const;
}
