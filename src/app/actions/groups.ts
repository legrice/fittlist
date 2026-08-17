"use server";

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { clockParts, todayIso } from "@/lib/format";

export type GroupClassChoice = { classId: string; iso: string; name: string; detail: string };
export type GroupPurpose = "plan" | "community" | "event";

function groupHandle(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42);
}

function databaseCode(error: unknown): string {
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    if ("code" in current && (typeof current.code === "string" || typeof current.code === "number")) return String(current.code);
    current = "cause" in current ? current.cause : null;
  }
  return "";
}

export async function checkGroupHandle(value: string) {
  const slug = groupHandle(value);
  if (slug.length < 3) return { ok: false, slug, error: "Use at least 3 letters or numbers." } as const;
  const db = await getDb();
  const [existing] = await db.select({ id: schema.groups.id }).from(schema.groups).where(eq(schema.groups.slug, slug));
  return existing ? { ok: false, slug, error: "That group link is already taken." } as const : { ok: true, slug } as const;
}

export async function groupClassOptions(): Promise<GroupClassChoice[]> {
  const userId = await getSessionUserId();
  if (!userId) return [];
  const db = await getDb();
  const marks = await db
    .select({ classId: schema.attendances.classId, iso: schema.attendances.occurrenceDate })
    .from(schema.attendances)
    .where(and(eq(schema.attendances.userId, userId), gte(schema.attendances.occurrenceDate, todayIso())));
  if (!marks.length) return [];
  const classes = await db.select().from(schema.classes).where(inArray(schema.classes.id, [...new Set(marks.map((mark) => mark.classId))]));
  const byId = new Map(classes.map((item) => [item.id, item]));
  return marks.flatMap((mark) => {
    const item = byId.get(mark.classId);
    if (!item) return [];
    const date = new Date(`${mark.iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    const time = clockParts(item.startTime);
    return [{ classId: mark.classId, iso: mark.iso, name: item.name, detail: `${date} · ${time.hm} ${time.ap}` }];
  });
}

export async function createGroup(input: { name: string; slug: string; purpose: GroupPurpose; visibility: "public" | "unlisted" | "private" }) {
  let stage = "session";
  try {
    const ownerUserId = await getSessionUserId();
    if (!ownerUserId) return { ok: false, error: "Sign in to create a group." } as const;
    const name = input.name.trim().replace(/\s+/g, " ");
    if (name.length < 2) return { ok: false, error: "Give your group a name." } as const;
    if (name.length > 60) return { ok: false, error: "Keep the name under 60 characters." } as const;
    stage = "database connection";
    const db = await getDb();
    stage = "account check";
    const [owner] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, ownerUserId));
    if (!owner) return { ok: false, error: "Account not found." } as const;
    const slug = groupHandle(input.slug);
    if (slug.length < 3) return { ok: false, error: "Choose a group link with at least 3 letters or numbers." } as const;
    stage = "handle check";
    const [existing] = await db.select({ id: schema.groups.id }).from(schema.groups).where(eq(schema.groups.slug, slug));
    if (existing) return { ok: false, error: "That group link is already taken." } as const;
    const visibility = ["public", "unlisted", "private"].includes(input.visibility) ? input.visibility : "unlisted";
    const purpose: GroupPurpose = ["plan", "community", "event"].includes(input.purpose) ? input.purpose : "plan";

    // Keep the essential insert compatible with databases that are between
    // the base group migration and the newer purpose migration. Purpose and
    // organizer membership enrich the group, but neither may block creation.
    stage = "core group insert";
    // Deliberately use explicit SQL here. Drizzle includes every schema column
    // as DEFAULT even when values omit it, which defeats compatibility with a
    // database whose later group columns are still being reconciled.
    const inserted = await db.execute<{ id: string }>(sql`insert into "groups" ("name", "slug", "owner_user_id") values (${name}, ${slug}, ${ownerUserId}) returning "id"`);
    const group = inserted.rows[0];
    if (!group) return { ok: false, error: "We couldn’t create the group. Please try again." } as const;
    try {
      await db.update(schema.groups).set({ purpose, visibility }).where(eq(schema.groups.id, group.id));
    } catch (error) {
      console.error("createGroup could not save purpose", error);
    }
    try {
      await db.insert(schema.groupMembers).values({ groupId: group.id, userId: ownerUserId, role: "owner" }).onConflictDoNothing();
    } catch (error) {
      console.error("createGroup could not save organizer membership", error);
    }
    try { revalidatePath("/saved"); } catch (error) { console.error("createGroup could not refresh favorites", error); }
    return { ok: true, id: group.id, slug } as const;
  } catch (error) {
    console.error("createGroup failed", error);
    const code = databaseCode(error);
    if (code === "23505") return { ok: false, error: "That group link was just taken. Go back and choose another." } as const;
    if (code === "42703" || code === "42P01") return { ok: false, error: "Group storage is still updating. Please try once more in a moment." } as const;
    return { ok: false, error: `Group creation stopped at ${stage}${code ? ` (${code})` : ""}.` } as const;
  }
}

async function groupManager(slug: string) {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const db = await getDb();
  const [row] = await db.select({ groupId: schema.groups.id, role: schema.groupMembers.role }).from(schema.groups).innerJoin(schema.groupMembers, eq(schema.groupMembers.groupId, schema.groups.id)).where(and(eq(schema.groups.slug, slug), eq(schema.groupMembers.userId, userId)));
  return row && (row.role === "owner" || row.role === "admin") ? { db, userId, ...row } : null;
}

export async function updateGroupDescription(slug: string, value: string) {
  const manager = await groupManager(slug);
  if (!manager) return { ok: false, error: "Only group admins can edit this." } as const;
  const description = value.trim().replace(/\s+/g, " ");
  if (description.length > 280) return { ok: false, error: "Keep the description under 280 characters." } as const;
  await manager.db.update(schema.groups).set({ description: description || null }).where(eq(schema.groups.id, manager.groupId));
  revalidatePath(`/g/${slug}`);
  return { ok: true } as const;
}

export async function addGroupClasses(slug: string, choices: { classId: string; iso: string }[]) {
  const manager = await groupManager(slug);
  if (!manager) return { ok: false, error: "Only group admins can add classes." } as const;
  const requested = [...new Map(choices.filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.iso)).map((item) => [`${item.classId}|${item.iso}`, item])).values()].slice(0, 30);
  if (!requested.length) return { ok: false, error: "Choose at least one class." } as const;
  const saved = await manager.db.select({ classId: schema.attendances.classId, iso: schema.attendances.occurrenceDate }).from(schema.attendances).where(and(eq(schema.attendances.userId, manager.userId), inArray(schema.attendances.classId, requested.map((item) => item.classId))));
  const allowed = new Set(saved.map((item) => `${item.classId}|${item.iso}`));
  const rows = requested.filter((item) => allowed.has(`${item.classId}|${item.iso}`));
  if (!rows.length) return { ok: false, error: "Save the class to your calendar first." } as const;
  await manager.db.insert(schema.groupClasses).values(rows.map((item) => ({ groupId: manager.groupId, classId: item.classId, occurrenceDate: item.iso }))).onConflictDoNothing();
  revalidatePath(`/g/${slug}`);
  return { ok: true } as const;
}

export async function inviteGroupPeople(slug: string, userIds: string[], role: "member" | "admin") {
  const manager = await groupManager(slug);
  if (!manager) return { ok: false, error: "Only group admins can invite people." } as const;
  const ids = [...new Set(userIds)].filter((id) => id !== manager.userId).slice(0, 30);
  if (!ids.length) return { ok: false, error: "Choose at least one person." } as const;
  const users = await manager.db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.id, ids));
  if (!users.length) return { ok: false, error: "Those people are no longer available." } as const;
  await manager.db.insert(schema.groupInvitations).values(users.map((user) => ({ groupId: manager.groupId, inviteeUserId: user.id, invitedByUserId: manager.userId, role }))).onConflictDoUpdate({ target: [schema.groupInvitations.groupId, schema.groupInvitations.inviteeUserId], set: { role, invitedByUserId: manager.userId } });
  revalidatePath(`/g/${slug}`);
  return { ok: true, count: users.length } as const;
}

export async function respondToGroupInvitation(slug: string, accept: boolean) {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false } as const;
  const db = await getDb();
  const [invite] = await db.select({ id: schema.groupInvitations.id, groupId: schema.groupInvitations.groupId, role: schema.groupInvitations.role }).from(schema.groupInvitations).innerJoin(schema.groups, eq(schema.groups.id, schema.groupInvitations.groupId)).where(and(eq(schema.groups.slug, slug), eq(schema.groupInvitations.inviteeUserId, userId)));
  if (!invite) return { ok: false } as const;
  await db.transaction(async (tx) => {
    if (accept && invite.role === "admin") await tx.insert(schema.groupMembers).values({ groupId: invite.groupId, userId, role: "admin" }).onConflictDoUpdate({ target: [schema.groupMembers.groupId, schema.groupMembers.userId], set: { role: "admin" } });
    else if (accept) await tx.insert(schema.groupMembers).values({ groupId: invite.groupId, userId, role: "member" }).onConflictDoNothing();
    await tx.delete(schema.groupInvitations).where(eq(schema.groupInvitations.id, invite.id));
  });
  revalidatePath(`/g/${slug}`);
  revalidatePath("/saved");
  return { ok: true } as const;
}

export async function toggleGroupFavorite(slug: string) {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, signedOut: true } as const;
  const db = await getDb();
  const [group] = await db.select({ id: schema.groups.id }).from(schema.groups).where(eq(schema.groups.slug, slug));
  if (!group) return { ok: false } as const;
  const [existing] = await db.select({ id: schema.groupFavorites.id }).from(schema.groupFavorites).where(and(eq(schema.groupFavorites.groupId, group.id), eq(schema.groupFavorites.userId, userId)));
  if (existing) await db.delete(schema.groupFavorites).where(eq(schema.groupFavorites.id, existing.id));
  else await db.insert(schema.groupFavorites).values({ groupId: group.id, userId });
  revalidatePath(`/g/${slug}`);
  revalidatePath("/saved");
  return { ok: true, selected: !existing } as const;
}
