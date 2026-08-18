"use server";

import { randomBytes } from "node:crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { clockParts, dowOfDate, runsOn, todayIso, weekDates } from "@/lib/format";
import { addNotification } from "@/lib/notify";

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

function databaseColumn(error: unknown): string {
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    if ("column" in current && typeof current.column === "string") return current.column;
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
  const [marks, coached] = await Promise.all([db
    .select({ classId: schema.attendances.classId, iso: schema.attendances.occurrenceDate })
    .from(schema.attendances)
    .where(and(eq(schema.attendances.userId, userId), gte(schema.attendances.occurrenceDate, todayIso()))), db.select().from(schema.classes).where(eq(schema.classes.userId, userId))]);
  const coachedMarks = coached.flatMap((item) => weekDates(0).concat(weekDates(1)).filter((iso) => runsOn(item, iso, dowOfDate(iso))).slice(0, 1).map((iso) => ({ classId:item.id, iso })));
  const allMarks = [...new Map([...marks, ...coachedMarks].map((mark) => [`${mark.classId}|${mark.iso}`, mark])).values()];
  if (!allMarks.length) return [];
  const classes = await db.select().from(schema.classes).where(inArray(schema.classes.id, [...new Set(allMarks.map((mark) => mark.classId))]));
  const byId = new Map(classes.map((item) => [item.id, item]));
  return allMarks.flatMap((mark) => {
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
    const inviteToken = randomBytes(24).toString("hex");

    // Keep the essential insert compatible with databases that are between
    // the base group migration and the newer purpose migration. Purpose and
    // organizer membership enrich the group, but neither may block creation.
    stage = "core group insert";
    // Deliberately use explicit SQL here. A partially applied migration left
    // newer NOT NULL columns without their intended defaults in production,
    // so creation supplies every required group value directly.
    const inserted = await db.execute<{ id: string }>(sql`insert into "groups" ("name", "slug", "owner_user_id", "visibility", "purpose", "invite_token") values (${name}, ${slug}, ${ownerUserId}, ${visibility}, ${purpose}, ${inviteToken}) returning "id"`);
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
    const column = databaseColumn(error);
    if (code === "23505") return { ok: false, error: "That group link was just taken. Go back and choose another." } as const;
    if (code === "42703" || code === "42P01") return { ok: false, error: "Group storage is still updating. Please try once more in a moment." } as const;
    return { ok: false, error: `Group creation stopped at ${stage}${code ? ` (${code}${column ? `: ${column}` : ""})` : ""}.` } as const;
  }
}

async function groupManager(slug: string) {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const db = await getDb();
  const [row] = await db.select({ groupId: schema.groups.id, role: schema.groupMembers.role }).from(schema.groups).innerJoin(schema.groupMembers, eq(schema.groupMembers.groupId, schema.groups.id)).where(and(eq(schema.groups.slug, slug), eq(schema.groupMembers.userId, userId)));
  return row && (row.role === "owner" || row.role === "admin") ? { db, userId, ...row } : null;
}

async function groupParticipant(slug: string) {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const db = await getDb();
  const [group] = await db.select({ id:schema.groups.id, name:schema.groups.name, ownerUserId:schema.groups.ownerUserId }).from(schema.groups).where(eq(schema.groups.slug, slug));
  if (!group) return null;
  const [member] = await db.select({ role:schema.groupMembers.role }).from(schema.groupMembers).where(and(eq(schema.groupMembers.groupId, group.id), eq(schema.groupMembers.userId, userId)));
  return member || group.ownerUserId === userId ? { db, userId, groupId:group.id, groupName:group.name } : null;
}

async function notifyGroup(groupId: string, actorId: string, title: string, body: string, href: string) {
  const db = await getDb();
  const recipients = await db.select({ userId:schema.groupMembers.userId }).from(schema.groupMembers).where(eq(schema.groupMembers.groupId, groupId));
  await Promise.all(recipients.filter((row) => row.userId !== actorId).map((row) => addNotification(row.userId, { type:"group_update", title, body, href, actorUserId:actorId })));
}

export async function addGroupPost(slug: string, value: string) {
  const member = await groupParticipant(slug);
  if (!member) return { ok:false, error:"Join the group to post updates." } as const;
  const body = value.trim().replace(/\s+/g, " ");
  if (!body) return { ok:false, error:"Write an update first." } as const;
  if (body.length > 500) return { ok:false, error:"Keep updates under 500 characters." } as const;
  const [post] = await member.db.insert(schema.groupPosts).values({ groupId:member.groupId, authorUserId:member.userId, body, kind:"update" }).returning({ id:schema.groupPosts.id });
  await notifyGroup(member.groupId, member.userId, `New update in ${member.groupName}`, body, `/g/${slug}?tab=updates#post-${post.id}`);
  revalidatePath(`/g/${slug}`);
  return { ok:true } as const;
}

export async function addGroupComment(slug: string, postId: string, value: string) {
  const member = await groupParticipant(slug);
  if (!member) return { ok:false, error:"Join the group to comment." } as const;
  const body = value.trim().replace(/\s+/g, " ");
  if (!body || body.length > 300) return { ok:false, error:"Keep comments between 1 and 300 characters." } as const;
  const [post] = await member.db.select({ id:schema.groupPosts.id, authorUserId:schema.groupPosts.authorUserId }).from(schema.groupPosts).where(and(eq(schema.groupPosts.id, postId), eq(schema.groupPosts.groupId, member.groupId)));
  if (!post) return { ok:false, error:"That update is no longer available." } as const;
  await member.db.insert(schema.groupPostComments).values({ postId, authorUserId:member.userId, body });
  if (post.authorUserId !== member.userId) await addNotification(post.authorUserId, { type:"group_update", title:`New reply in ${member.groupName}`, body, href:`/g/${slug}?tab=updates#post-${postId}`, actorUserId:member.userId });
  revalidatePath(`/g/${slug}`);
  return { ok:true } as const;
}

export async function toggleGroupReaction(slug: string, postId: string, reaction: "heart" | "strong" | "in") {
  const member = await groupParticipant(slug);
  if (!member || !["heart","strong","in"].includes(reaction)) return { ok:false } as const;
  const [post] = await member.db.select({ id:schema.groupPosts.id }).from(schema.groupPosts).where(and(eq(schema.groupPosts.id, postId), eq(schema.groupPosts.groupId, member.groupId)));
  if (!post) return { ok:false } as const;
  const where = and(eq(schema.groupPostReactions.postId, postId), eq(schema.groupPostReactions.userId, member.userId), eq(schema.groupPostReactions.reaction, reaction));
  const [existing] = await member.db.select({ id:schema.groupPostReactions.id }).from(schema.groupPostReactions).where(where);
  if (existing) await member.db.delete(schema.groupPostReactions).where(eq(schema.groupPostReactions.id, existing.id));
  else await member.db.insert(schema.groupPostReactions).values({ postId, userId:member.userId, reaction });
  revalidatePath(`/g/${slug}`);
  return { ok:true, selected:!existing } as const;
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

export async function updateGroupDetails(slug: string, input: { name: string; photo: string | null }) {
  const manager = await groupManager(slug);
  if (!manager) return { ok: false, error: "Only group admins can edit this." } as const;
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) return { ok: false, error: "Give your group a name." } as const;
  if (name.length > 60) return { ok: false, error: "Keep the name under 60 characters." } as const;
  const photo = input.photo?.trim() || null;
  if (photo && (!photo.startsWith("data:image/") || photo.length > 2_000_000)) {
    return { ok: false, error: "Choose a smaller image." } as const;
  }
  await manager.db.update(schema.groups).set({ name, photo }).where(eq(schema.groups.id, manager.groupId));
  revalidatePath(`/g/${slug}`);
  revalidatePath("/saved");
  return { ok: true } as const;
}

export async function updateGroupVisibility(slug: string, visibility: "public" | "unlisted" | "private") {
  const manager = await groupManager(slug);
  if (!manager) return { ok: false, error: "Only group admins can change privacy." } as const;
  if (!["public", "unlisted", "private"].includes(visibility)) return { ok: false, error: "Choose a privacy option." } as const;
  await manager.db.update(schema.groups).set({ visibility }).where(eq(schema.groups.id, manager.groupId));
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
  const added = await manager.db.insert(schema.groupClasses).values(rows.map((item) => ({ groupId: manager.groupId, classId: item.classId, occurrenceDate: item.iso }))).onConflictDoNothing().returning({ classId:schema.groupClasses.classId, iso:schema.groupClasses.occurrenceDate });
  if (added.length) {
    await manager.db.insert(schema.groupPosts).values(added.map((item) => ({ groupId:manager.groupId, authorUserId:manager.userId, kind:"class_added", classId:item.classId, occurrenceDate:item.iso }))).onConflictDoNothing();
    const [group] = await manager.db.select({ name:schema.groups.name }).from(schema.groups).where(eq(schema.groups.id, manager.groupId));
    await notifyGroup(manager.groupId, manager.userId, `New class in ${group?.name ?? "your group"}`, "A class was added to the group calendar.", `/g/${slug}?tab=updates`);
  }
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
