"use server";

import { and, desc, eq, inArray, like } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { currentAdmin } from "@/lib/admin";
import { getSessionUserId } from "@/lib/session";
import { studioAccess } from "@/lib/studioaccess";
import { dropFollow, hiddenFrom } from "@/lib/blocks";
import { inquiryMessageAuthorUserId, verifyInquiryToken } from "@/lib/inquiry";
import { deleteUnreferencedStoredImages } from "@/lib/purge";

export type ReportableContentType =
  | "group"
  | "group_post"
  | "group_comment"
  | "shoutout"
  | "profile"
  | "inquiry_message";

export type ContentReportReason =
  | "Harassment or bullying"
  | "Hate or threats"
  | "Sexual content"
  | "Spam or scam"
  | "Impersonation"
  | "Private information"
  | "Something else";

export type ReportedContent = {
  key: string;
  contentType: ReportableContentType;
  contentId: string;
  subject: string;
  excerpt: string;
  href: string | null;
  count: number;
  reasons: string[];
  notes: string[];
  reporters: string[];
  createdAt: string;
};

const TYPES = new Set<ReportableContentType>([
  "group",
  "group_post",
  "group_comment",
  "shoutout",
  "profile",
  "inquiry_message",
]);
const REASONS = new Set<ContentReportReason>([
  "Harassment or bullying",
  "Hate or threats",
  "Sexual content",
  "Spam or scam",
  "Impersonation",
  "Private information",
  "Something else",
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Snapshot = {
  contextId: string | null;
  authorUserId: string | null;
  subject: string;
  excerpt: string;
  href: string | null;
};

function excerpt(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, 500);
}

async function groupIsVisibleTo(
  db: Awaited<ReturnType<typeof getDb>>,
  group: { id: string; visibility: string; ownerUserId: string },
  userId: string,
) {
  if (group.ownerUserId === userId) return true;
  const hiddenUsers = await hiddenFrom(userId);
  if (hiddenUsers.has(group.ownerUserId)) return false;
  if (group.visibility !== "private") return true;
  const [[member], [invite]] = await Promise.all([
    db.select({ id: schema.groupMembers.id }).from(schema.groupMembers).where(and(eq(schema.groupMembers.groupId, group.id), eq(schema.groupMembers.userId, userId))),
    db.select({ id: schema.groupInvitations.id, invitedByUserId: schema.groupInvitations.invitedByUserId }).from(schema.groupInvitations).where(and(eq(schema.groupInvitations.groupId, group.id), eq(schema.groupInvitations.inviteeUserId, userId))),
  ]);
  if (invite && hiddenUsers.has(invite.invitedByUserId)) {
    await db.delete(schema.groupInvitations).where(eq(schema.groupInvitations.id, invite.id));
    return !!member;
  }
  return !!member || !!invite;
}

async function snapshotFor(
  db: Awaited<ReturnType<typeof getDb>>,
  reporterUserId: string,
  contentType: ReportableContentType,
  contentId: string,
): Promise<Snapshot | null> {
  if (contentType === "group") {
    const [row] = await db
      .select({
        id: schema.groups.id,
        name: schema.groups.name,
        description: schema.groups.description,
        slug: schema.groups.slug,
        visibility: schema.groups.visibility,
        ownerUserId: schema.groups.ownerUserId,
      })
      .from(schema.groups)
      .where(eq(schema.groups.id, contentId));
    if (!row || row.ownerUserId === reporterUserId || !(await groupIsVisibleTo(db, row, reporterUserId))) return null;
    return {
      contextId: row.id,
      authorUserId: row.ownerUserId,
      subject: `Group: ${row.name}`,
      excerpt: excerpt([row.name, row.description].filter(Boolean).join(" / ")),
      href: `/g/${row.slug}`,
    };
  }

  if (contentType === "group_post") {
    const [row] = await db.select({
      body: schema.groupPosts.body,
      authorUserId: schema.groupPosts.authorUserId,
      groupId: schema.groups.id,
      groupName: schema.groups.name,
      groupSlug: schema.groups.slug,
      visibility: schema.groups.visibility,
      ownerUserId: schema.groups.ownerUserId,
    }).from(schema.groupPosts).innerJoin(schema.groups, eq(schema.groups.id, schema.groupPosts.groupId)).where(eq(schema.groupPosts.id, contentId));
    if (!row || row.authorUserId === reporterUserId || !(await groupIsVisibleTo(db, { id: row.groupId, visibility: row.visibility, ownerUserId: row.ownerUserId }, reporterUserId))) return null;
    return { contextId: row.groupId, authorUserId: row.authorUserId, subject: `Update in ${row.groupName}`, excerpt: excerpt(row.body) || "Group calendar activity", href: `/g/${row.groupSlug}?tab=updates#post-${contentId}` };
  }

  if (contentType === "group_comment") {
    const [row] = await db.select({
      body: schema.groupPostComments.body,
      authorUserId: schema.groupPostComments.authorUserId,
      postId: schema.groupPosts.id,
      groupId: schema.groups.id,
      groupName: schema.groups.name,
      groupSlug: schema.groups.slug,
      visibility: schema.groups.visibility,
      ownerUserId: schema.groups.ownerUserId,
    }).from(schema.groupPostComments)
      .innerJoin(schema.groupPosts, eq(schema.groupPosts.id, schema.groupPostComments.postId))
      .innerJoin(schema.groups, eq(schema.groups.id, schema.groupPosts.groupId))
      .where(eq(schema.groupPostComments.id, contentId));
    if (!row || row.authorUserId === reporterUserId || !(await groupIsVisibleTo(db, { id: row.groupId, visibility: row.visibility, ownerUserId: row.ownerUserId }, reporterUserId))) return null;
    return { contextId: row.groupId, authorUserId: row.authorUserId, subject: `Reply in ${row.groupName}`, excerpt: excerpt(row.body), href: `/g/${row.groupSlug}?tab=updates#post-${row.postId}` };
  }

  if (contentType === "shoutout") {
    const [row] = await db.select().from(schema.shoutouts).where(eq(schema.shoutouts.id, contentId));
    if (!row || row.authorUserId === reporterUserId) return null;
    let subject = "Shoutout";
    let href: string | null = null;
    let canSeeUnfeatured = false;
    if (row.targetUserId) {
      const [target] = await db.select({ name: schema.users.name, handle: schema.users.handle }).from(schema.users).where(eq(schema.users.id, row.targetUserId));
      subject = `Shoutout on ${target?.name || "a profile"}`;
      href = target?.handle ? `/${target.handle}#profile-shoutouts` : null;
      canSeeUnfeatured = row.targetUserId === reporterUserId;
    } else if (row.targetStudioId) {
      const [[target], [viewer]] = await Promise.all([
        db.select({ name: schema.studios.name, slug: schema.studios.slug }).from(schema.studios).where(eq(schema.studios.id, row.targetStudioId)),
        db.select({ kind: schema.users.kind }).from(schema.users).where(eq(schema.users.id, reporterUserId)),
      ]);
      subject = `Shoutout on ${target?.name || "a studio"}`;
      href = target ? `/s/${target.slug ?? row.targetStudioId}#profile-shoutouts` : null;
      canSeeUnfeatured = !!viewer && (await studioAccess(row.targetStudioId, { id: reporterUserId, kind: viewer.kind })).canEdit;
    }
    if (!row.featuredAt && !canSeeUnfeatured) return null;
    return { contextId: row.targetUserId ?? row.targetStudioId, authorUserId: row.authorUserId, subject, excerpt: excerpt(row.body), href };
  }

  if (contentType === "profile") {
    const [target] = await db.select({ id: schema.users.id, name: schema.users.name, handle: schema.users.handle, title: schema.users.title, about: schema.users.about }).from(schema.users).where(eq(schema.users.id, contentId));
    if (!target?.handle || target.id === reporterUserId) return null;
    return { contextId: null, authorUserId: target.id, subject: `${target.name || "User"}’s profile`, excerpt: excerpt([target.title, target.about].filter(Boolean).join(" / ")) || "Public profile", href: `/${target.handle}` };
  }

  const [row] = await db.select({
    body: schema.inquiryMessages.body,
    fromCoach: schema.inquiryMessages.fromCoach,
    threadId: schema.inquiryThreads.id,
    coachUserId: schema.inquiryThreads.coachUserId,
    requesterEmail: schema.inquiryThreads.requesterEmail,
    requesterName: schema.inquiryThreads.requesterName,
  }).from(schema.inquiryMessages).innerJoin(schema.inquiryThreads, eq(schema.inquiryThreads.id, schema.inquiryMessages.threadId)).where(eq(schema.inquiryMessages.id, contentId));
  if (!row) return null;
  const [me] = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, reporterUserId));
  const isCoach = row.coachUserId === reporterUserId;
  const isRequester = !!me && me.email.toLocaleLowerCase() === row.requesterEmail.toLocaleLowerCase();
  if ((!isCoach && !isRequester) || (isCoach && row.fromCoach) || (isRequester && !row.fromCoach)) return null;
  // requesterEmail was typed into a public form. Even if an account happens
  // to have the same address, it is not a verified binding to this message and
  // must never make "stop" block that unrelated account.
  const authorUserId = inquiryMessageAuthorUserId(row.fromCoach, row.coachUserId);
  return { contextId: row.threadId, authorUserId, subject: `Private message with ${row.requesterName || row.requesterEmail}`, excerpt: excerpt(row.body), href: null };
}

export async function reportContent(input: {
  contentType: ReportableContentType;
  contentId: string;
  reason: ContentReportReason;
  note?: string;
  blockAuthor?: boolean;
}): Promise<{ ok: boolean; error?: string; alreadyReported?: boolean; blocked?: boolean }> {
  const reporterUserId = await getSessionUserId();
  if (!reporterUserId) return { ok: false, error: "Sign in to report this." };
  if (!TYPES.has(input.contentType) || !UUID_RE.test(input.contentId) || !REASONS.has(input.reason)) return { ok: false, error: "Choose a report reason." };
  const db = await getDb();
  const snapshot = await snapshotFor(db, reporterUserId, input.contentType, input.contentId);
  if (!snapshot) return { ok: false, error: "That content isn’t available to report." };
  const inserted = await db.insert(schema.contentReports).values({
    contentType: input.contentType,
    contentId: input.contentId,
    contextId: snapshot.contextId,
    authorUserId: snapshot.authorUserId,
    reporterUserId,
    reporterKey: `user:${reporterUserId}`,
    reporterLabel: "Community member",
    reason: input.reason,
    note: excerpt(input.note).slice(0, 500),
    excerpt: snapshot.excerpt,
    subject: snapshot.subject,
    href: snapshot.href,
  }).onConflictDoNothing().returning({ id: schema.contentReports.id });
  let blocked = false;
  if (input.blockAuthor && input.contentType === "inquiry_message" && snapshot.contextId) {
    const [thread] = await db
      .select({ coachUserId: schema.inquiryThreads.coachUserId })
      .from(schema.inquiryThreads)
      .where(eq(schema.inquiryThreads.id, snapshot.contextId));
    if (thread?.coachUserId === reporterUserId) {
      await db
        .update(schema.inquiryThreads)
        .set({ coachClosedAt: new Date() })
        .where(eq(schema.inquiryThreads.id, snapshot.contextId));
      blocked = true;
    }
  }
  if (input.blockAuthor && snapshot.authorUserId && snapshot.authorUserId !== reporterUserId) {
    await db.insert(schema.blocks).values({ blockerUserId: reporterUserId, blockedUserId: snapshot.authorUserId }).onConflictDoNothing();
    await dropFollow(reporterUserId, snapshot.authorUserId);
    await dropFollow(snapshot.authorUserId, reporterUserId);
    blocked = true;
  }
  revalidatePath("/admin");
  revalidatePath("/", "layout");
  return { ok: true, alreadyReported: inserted.length === 0, blocked };
}

/** A visitor's signed thread URL is their authorization to report the coach's
 * reply. The stable thread id de-duplicates without storing the raw token or
 * requester email in the moderation table. */
export async function reportMessageByToken(input: {
  token: string;
  messageId: string;
  reason: ContentReportReason;
  note?: string;
  stopConversation?: boolean;
}): Promise<{ ok: boolean; error?: string; alreadyReported?: boolean; blocked?: boolean }> {
  if (!UUID_RE.test(input.messageId) || !REASONS.has(input.reason)) return { ok: false, error: "Choose a report reason." };
  const threadId = await verifyInquiryToken(input.token);
  if (!threadId) return { ok: false, error: "This conversation link is no longer valid." };
  const db = await getDb();
  const [row] = await db.select({
    body: schema.inquiryMessages.body,
    fromCoach: schema.inquiryMessages.fromCoach,
    coachUserId: schema.inquiryThreads.coachUserId,
    coachName: schema.users.name,
  }).from(schema.inquiryMessages)
    .innerJoin(schema.inquiryThreads, eq(schema.inquiryThreads.id, schema.inquiryMessages.threadId))
    .innerJoin(schema.users, eq(schema.users.id, schema.inquiryThreads.coachUserId))
    .where(and(eq(schema.inquiryMessages.id, input.messageId), eq(schema.inquiryMessages.threadId, threadId)));
  if (!row || !row.fromCoach || row.body === "[Removed by moderation]") return { ok: false, error: "That message isn’t available to report." };
  const inserted = await db.insert(schema.contentReports).values({
    contentType: "inquiry_message",
    contentId: input.messageId,
    contextId: threadId,
    authorUserId: row.coachUserId,
    reporterUserId: null,
    reporterKey: `thread:${threadId}`,
    reporterLabel: "Email participant",
    reason: input.reason,
    note: excerpt(input.note).slice(0, 500),
    excerpt: excerpt(row.body),
    subject: `Private message from ${row.coachName || "a coach"}`,
    href: null,
  }).onConflictDoNothing().returning({ id: schema.contentReports.id });
  if (input.stopConversation) await db.update(schema.inquiryThreads).set({ requesterClosedAt: new Date() }).where(eq(schema.inquiryThreads.id, threadId));
  revalidatePath("/admin");
  return { ok: true, alreadyReported: inserted.length === 0, blocked: !!input.stopConversation };
}

export async function listContentReports(): Promise<ReportedContent[]> {
  if (!(await currentAdmin())) return [];
  const db = await getDb();
  const rows = await db.select().from(schema.contentReports).where(eq(schema.contentReports.status, "open")).orderBy(desc(schema.contentReports.createdAt));
  const reporterIds = [...new Set(rows.map((row) => row.reporterUserId).filter((id): id is string => !!id))];
  const reporters = reporterIds.length ? await db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email }).from(schema.users).where(inArray(schema.users.id, reporterIds)) : [];
  const reporterById = new Map(reporters.map((person) => [person.id, person.name.trim() || person.email]));
  const grouped = new Map<string, ReportedContent>();
  for (const row of rows) {
    const contentType = row.contentType as ReportableContentType;
    const key = `${contentType}:${row.contentId}`;
    const current = grouped.get(key) ?? { key, contentType, contentId: row.contentId, subject: row.subject, excerpt: row.excerpt, href: row.href, count: 0, reasons: [], notes: [], reporters: [], createdAt: row.createdAt.toISOString() };
    current.count += 1;
    if (!current.reasons.includes(row.reason)) current.reasons.push(row.reason);
    if (row.note && !current.notes.includes(row.note)) current.notes.push(row.note);
    const reporter = row.reporterUserId ? (reporterById.get(row.reporterUserId) ?? "Deleted account") : row.reporterLabel;
    if (!current.reporters.includes(reporter)) current.reporters.push(reporter);
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => b.count - a.count || b.createdAt.localeCompare(a.createdAt));
}

export async function moderateReportedContent(
  contentType: ReportableContentType,
  contentId: string,
  action: "dismiss" | "remove",
): Promise<{ ok: boolean; error?: string }> {
  const admin = await currentAdmin();
  if (!admin || !TYPES.has(contentType) || !UUID_RE.test(contentId)) return { ok: false, error: "Not allowed." };
  const db = await getDb();
  const [open] = await db.select({ id: schema.contentReports.id }).from(schema.contentReports).where(and(eq(schema.contentReports.contentType, contentType), eq(schema.contentReports.contentId, contentId), eq(schema.contentReports.status, "open")));
  if (!open) return { ok: false, error: "That report is already handled." };
  let path: string | null = null;
  let removedImages: Array<string | null | undefined> = [];

  if (action === "remove") {
    if (contentType === "group") {
      const [group] = await db.select({ slug: schema.groups.slug, photo: schema.groups.photo }).from(schema.groups).where(eq(schema.groups.id, contentId));
      if (group) {
        const posts = await db.select({ id: schema.groupPosts.id }).from(schema.groupPosts).where(eq(schema.groupPosts.groupId, contentId));
        const postIds = posts.map((post) => post.id);
        const comments = postIds.length ? await db.select({ id: schema.groupPostComments.id }).from(schema.groupPostComments).where(inArray(schema.groupPostComments.postId, postIds)) : [];
        const now = new Date();
        if (postIds.length) await db.update(schema.contentReports).set({ status: "removed", handledAt: now, handledByUserId: admin.id }).where(and(eq(schema.contentReports.contentType, "group_post"), inArray(schema.contentReports.contentId, postIds), eq(schema.contentReports.status, "open")));
        if (comments.length) await db.update(schema.contentReports).set({ status: "removed", handledAt: now, handledByUserId: admin.id }).where(and(eq(schema.contentReports.contentType, "group_comment"), inArray(schema.contentReports.contentId, comments.map((comment) => comment.id)), eq(schema.contentReports.status, "open")));
        await db.delete(schema.notifications).where(like(schema.notifications.href, `/g/${group.slug}%`));
        await db.delete(schema.groups).where(eq(schema.groups.id, contentId));
        removedImages = [group.photo];
        path = `/g/${group.slug}`;
      }
    } else if (contentType === "group_post") {
      const [post] = await db.select({ groupId: schema.groups.id, slug: schema.groups.slug }).from(schema.groupPosts).innerJoin(schema.groups, eq(schema.groups.id, schema.groupPosts.groupId)).where(eq(schema.groupPosts.id, contentId));
      const comments = await db.select({ id: schema.groupPostComments.id }).from(schema.groupPostComments).where(eq(schema.groupPostComments.postId, contentId));
      if (comments.length) await db.update(schema.contentReports).set({ status: "removed", handledAt: new Date(), handledByUserId: admin.id }).where(and(eq(schema.contentReports.contentType, "group_comment"), inArray(schema.contentReports.contentId, comments.map((comment) => comment.id)), eq(schema.contentReports.status, "open")));
      if (post) await db.delete(schema.notifications).where(eq(schema.notifications.href, `/g/${post.slug}?tab=updates#post-${contentId}`));
      await db.delete(schema.groupPosts).where(eq(schema.groupPosts.id, contentId));
      path = post ? `/g/${post.slug}` : null;
    } else if (contentType === "group_comment") {
      const [comment] = await db.select({ slug: schema.groups.slug, postId: schema.groupPosts.id, body: schema.groupPostComments.body, authorUserId: schema.groupPostComments.authorUserId }).from(schema.groupPostComments).innerJoin(schema.groupPosts, eq(schema.groupPosts.id, schema.groupPostComments.postId)).innerJoin(schema.groups, eq(schema.groups.id, schema.groupPosts.groupId)).where(eq(schema.groupPostComments.id, contentId));
      if (comment) await db.delete(schema.notifications).where(and(eq(schema.notifications.href, `/g/${comment.slug}?tab=updates#post-${comment.postId}`), eq(schema.notifications.actorUserId, comment.authorUserId), eq(schema.notifications.body, comment.body)));
      await db.delete(schema.groupPostComments).where(eq(schema.groupPostComments.id, contentId));
      path = comment ? `/g/${comment.slug}` : null;
    } else if (contentType === "shoutout") {
      const [row] = await db.select().from(schema.shoutouts).where(eq(schema.shoutouts.id, contentId));
      if (row?.targetUserId) {
        const [target] = await db.select({ handle: schema.users.handle }).from(schema.users).where(eq(schema.users.id, row.targetUserId));
        path = target?.handle ? `/${target.handle}` : null;
      } else if (row?.targetStudioId) {
        const [target] = await db.select({ slug: schema.studios.slug }).from(schema.studios).where(eq(schema.studios.id, row.targetStudioId));
        path = target ? `/s/${target.slug ?? row.targetStudioId}` : null;
      }
      if (row) await db.delete(schema.notifications).where(and(eq(schema.notifications.type, "shoutout_received"), eq(schema.notifications.actorUserId, row.authorUserId), eq(schema.notifications.body, row.body)));
      await db.delete(schema.shoutouts).where(eq(schema.shoutouts.id, contentId));
    } else if (contentType === "inquiry_message") {
      const [message] = await db.select({ threadId: schema.inquiryMessages.threadId, body: schema.inquiryMessages.body, fromCoach: schema.inquiryMessages.fromCoach, kind: schema.inquiryThreads.kind }).from(schema.inquiryMessages).innerJoin(schema.inquiryThreads, eq(schema.inquiryThreads.id, schema.inquiryMessages.threadId)).where(eq(schema.inquiryMessages.id, contentId));
      if (message) {
        const notificationHref = message.kind === "feedback" && message.fromCoach ? "/feedback" : `/inbox/${message.threadId}`;
        await db.update(schema.notifications).set({ body: "[Removed by moderation]" }).where(and(eq(schema.notifications.href, notificationHref), eq(schema.notifications.body, message.body)));
      }
      await db.update(schema.inquiryMessages).set({ body: "[Removed by moderation]" }).where(eq(schema.inquiryMessages.id, contentId));
      path = message ? `/inbox/${message.threadId}` : null;
    } else {
      const [target] = await db.select({
        handle: schema.users.handle,
        photo: schema.users.photo,
        photoThumb: schema.users.photoThumb,
        storyPrefs: schema.users.storyPrefs,
      }).from(schema.users).where(eq(schema.users.id, contentId));
      removedImages = [target?.photo, target?.photoThumb, target?.storyPrefs?.background];
      // Remove the public identity rather than only removing it from search:
      // a direct link must not keep serving the material an admin removed.
      await db.update(schema.users).set({
        name: "FittList member",
        handle: null,
        title: null,
        about: "",
        photo: null,
        photoThumb: null,
        certifications: [],
        highlights: [],
        disciplines: [],
        profileLinks: [],
        instagram: null,
        website: null,
        contactEmail: null,
        phone: null,
        whatsapp: null,
        announcement: null,
        announcementAt: null,
        storyPrefs: {},
        discoverable: false,
      }).where(eq(schema.users.id, contentId));
      path = target?.handle ? `/${target.handle}` : null;
      revalidatePath("/discover");
    }
  }

  await db.update(schema.contentReports).set({
    status: action === "dismiss" ? "dismissed" : "removed",
    handledAt: new Date(),
    handledByUserId: admin.id,
  }).where(and(eq(schema.contentReports.contentType, contentType), eq(schema.contentReports.contentId, contentId), eq(schema.contentReports.status, "open")));
  if (path) revalidatePath(path);
  revalidatePath("/admin");
  revalidatePath("/", "layout");
  if (removedImages.length) {
    try {
      await deleteUnreferencedStoredImages(db, removedImages);
    } catch (error) {
      console.error("moderated profile image cleanup failed", { userId: contentId, error });
    }
  }
  return { ok: true };
}
