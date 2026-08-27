import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import type { getDb } from "../src/db/index";
import { purgeUser } from "../src/lib/purge";
import { managedBlobUrl } from "../src/lib/storage";

const fail = (message: string): never => {
  throw new Error(`PURGE CHECK FAILED: ${message}`);
};
const expect = (condition: unknown, message: string): void => {
  if (!condition) fail(message);
};

const store = "https://fittlist.public.blob.vercel-storage.com";
const urls = {
  profile: `${store}/u/profile.jpg`,
  thumbKeptByEvent: `${store}/ut/thumb.jpg`,
  background: `${store}/story-background/background.jpg`,
  classOnly: `${store}/class/only.jpg`,
  classKeptByClass: `${store}/class/shared.jpg`,
  classKeptByStandardWeek: `${store}/class/standard-week.jpg`,
  template: `${store}/class/template.jpg`,
  personal: `${store}/class/personal.jpg`,
  groupKept: `${store}/group/kept.jpg`,
  groupDeleted: `${store}/group/deleted.jpg`,
  cleanupFailure: `${store}/u/failure.jpg`,
};

async function main(): Promise<void> {
expect(managedBlobUrl(urls.profile) === urls.profile, "managed image URL was not recognized");
expect(managedBlobUrl("https://example.com/photo.jpg") === null, "external URL was treated as ours");
expect(managedBlobUrl(`${store}/marketing/logo.png`) === null, "unmanaged store path was treated as an upload");

const client = new PGlite();
const db = drizzle(client, { schema });
await migrate(db, { migrationsFolder: "./drizzle" });

const [owner, ordinaryMember, adminMember, outsider] = await db
  .insert(schema.users)
  .values([
    {
      email: "purge-owner@example.com",
      name: "Deleting owner",
      photo: urls.profile,
      photoThumb: urls.thumbKeptByEvent,
      storyPrefs: { background: urls.background },
    },
    { email: "purge-member@example.com", name: "Older member" },
    { email: "purge-admin@example.com", name: "Group admin" },
    { email: "purge-outsider@example.com", name: "Outsider" },
  ])
  .returning();

// The event is shared directory data and survives de-attributed. Its reference
// must therefore keep a URL that was also the deleting account's thumbnail.
await db.insert(schema.events).values({
  name: "Shared event",
  startDate: "2026-09-01",
  endDate: "2026-09-01",
  place: "Town Hall",
  photo: urls.thumbKeptByEvent,
  createdByUserId: owner.id,
});

const [studio] = await db.insert(schema.studios).values({
  name: "Reference-safe studio",
  address: "1 Main St",
  slug: "purge-reference-studio",
  standardWeek: {
    "0": [{
      name: "Shared class",
      classType: null,
      description: null,
      image: urls.classKeptByStandardWeek,
      startTime: "08:00",
      durationMin: 60,
      links: [],
      plannerColor: null,
      isPublic: true,
    }],
  },
}).returning();

const ownedClasses = await db.insert(schema.classes).values([
  {
    userId: owner.id,
    name: "Delete this image",
    dayOfWeek: 0,
    startTime: "08:00",
    durationMin: 60,
    image: urls.classOnly,
  },
  {
    userId: owner.id,
    name: "Shared image",
    dayOfWeek: 1,
    startTime: "09:00",
    durationMin: 60,
    image: urls.classKeptByClass,
  },
  {
    userId: owner.id,
    name: "Standard image",
    dayOfWeek: 2,
    startTime: "10:00",
    durationMin: 60,
    studioId: studio.id,
    image: urls.classKeptByStandardWeek,
  },
]).returning();
await db.insert(schema.classes).values({
  userId: outsider.id,
  name: "Other account shares bytes",
  dayOfWeek: 1,
  startTime: "11:00",
  durationMin: 60,
  image: urls.classKeptByClass,
});
await db.insert(schema.classTemplates).values({
  userId: owner.id,
  name: "Owned template",
  startTime: "12:00",
  durationMin: 45,
  image: urls.template,
});
await db.insert(schema.personalClasses).values({
  userId: owner.id,
  name: "Owned personal class",
  dayOfWeek: 3,
  startTime: "13:00",
  durationMin: 30,
  image: urls.personal,
});

const [survivingGroup, emptyGroup, otherGroup] = await db.insert(schema.groups).values([
  {
    name: "Inherited group",
    slug: "purge-inherited-group",
    inviteToken: "purge-inherited-token",
    ownerUserId: owner.id,
    photo: urls.groupKept,
  },
  {
    name: "Empty group",
    slug: "purge-empty-group",
    inviteToken: "purge-empty-token",
    ownerUserId: owner.id,
    photo: urls.groupDeleted,
  },
  {
    name: "Other group",
    slug: "purge-other-group",
    inviteToken: "purge-other-token",
    ownerUserId: outsider.id,
  },
]).returning();

// The ordinary member joined first, but an existing admin is the safer owner.
await db.insert(schema.groupMembers).values([
  { groupId: survivingGroup.id, userId: owner.id, role: "owner" },
  { groupId: survivingGroup.id, userId: ordinaryMember.id, role: "member" },
  { groupId: survivingGroup.id, userId: adminMember.id, role: "admin" },
  { groupId: emptyGroup.id, userId: owner.id, role: "owner" },
  { groupId: otherGroup.id, userId: outsider.id, role: "owner" },
  { groupId: otherGroup.id, userId: owner.id, role: "member" },
]);

// A class plan is group-owned. The deleting coach's class disappears through
// its FK cascade without deleting either surviving group.
await db.insert(schema.groupClasses).values({
  groupId: survivingGroup.id,
  classId: ownedClasses[0].id,
  occurrenceDate: "2026-09-07",
});

const [deletedPost, survivingPost] = await db.insert(schema.groupPosts).values([
  { groupId: otherGroup.id, authorUserId: owner.id, body: "Delete my update" },
  { groupId: otherGroup.id, authorUserId: outsider.id, body: "Keep this update" },
]).returning();
await db.insert(schema.groupPostComments).values([
  { postId: deletedPost.id, authorUserId: outsider.id, body: "Nested reply loses its parent" },
  { postId: survivingPost.id, authorUserId: owner.id, body: "Delete my reply" },
  { postId: survivingPost.id, authorUserId: ordinaryMember.id, body: "Keep my reply" },
]);
await db.insert(schema.groupPostReactions).values([
  { postId: deletedPost.id, userId: outsider.id, reaction: "heart" },
  { postId: survivingPost.id, userId: owner.id, reaction: "strong" },
  { postId: survivingPost.id, userId: ordinaryMember.id, reaction: "in" },
]);
await db.insert(schema.groupInvitations).values([
  { groupId: otherGroup.id, inviteeUserId: owner.id, invitedByUserId: outsider.id },
  { groupId: otherGroup.id, inviteeUserId: adminMember.id, invitedByUserId: owner.id },
]);
await db.insert(schema.groupFavorites).values({ groupId: otherGroup.id, userId: owner.id });
const [moderationRecord] = await db.insert(schema.contentReports).values({
  contentType: "group_post",
  contentId: deletedPost.id,
  contextId: otherGroup.id,
  authorUserId: owner.id,
  reporterUserId: outsider.id,
  reporterKey: `user:${outsider.id}`,
  reason: "other",
  excerpt: "Delete my update",
  subject: "Deleting owner's update",
  href: `/g/${otherGroup.slug}?tab=updates#post-${deletedPost.id}`,
}).returning();
const [survivingGroupReport, deletedGroupReport] = await db.insert(schema.contentReports).values([
  {
    contentType: "group",
    contentId: survivingGroup.id,
    contextId: survivingGroup.id,
    authorUserId: owner.id,
    reporterUserId: outsider.id,
    reporterKey: `group-survives:${outsider.id}`,
    reason: "other",
    excerpt: "Inherited group snapshot",
    subject: "Inherited group",
    href: `/g/${survivingGroup.slug}`,
  },
  {
    contentType: "group",
    contentId: emptyGroup.id,
    contextId: emptyGroup.id,
    authorUserId: owner.id,
    reporterUserId: outsider.id,
    reporterKey: `group-deleted:${outsider.id}`,
    reason: "other",
    excerpt: "Empty group snapshot",
    subject: "Empty group",
    href: `/g/${emptyGroup.slug}`,
  },
]).returning();

await db.insert(schema.notifications).values([
  {
    userId: outsider.id,
    actorUserId: owner.id,
    type: "group_update",
    title: "Copied group content",
    body: "Delete my update",
  },
  {
    userId: outsider.id,
    actorUserId: owner.id,
    type: "follow",
    title: "Someone followed you",
  },
]);

let deletionCall: string[] = [];
await purgeUser(
  db as unknown as Awaited<ReturnType<typeof getDb>>,
  owner.id,
  { deleteImages: async (values) => { deletionCall = [...values].sort(); } },
);

expect(!(await db.select().from(schema.users).where(eq(schema.users.id, owner.id)))[0], "account row survived");
const [inherited] = await db.select().from(schema.groups).where(eq(schema.groups.id, survivingGroup.id));
expect(inherited?.ownerUserId === adminMember.id, "group did not prefer its existing admin as successor");
const [newOwnerMembership] = await db.select().from(schema.groupMembers).where(and(
  eq(schema.groupMembers.groupId, survivingGroup.id),
  eq(schema.groupMembers.userId, adminMember.id),
));
expect(newOwnerMembership?.role === "owner", "successor membership is not owner");
expect(!(await db.select().from(schema.groups).where(eq(schema.groups.id, emptyGroup.id)))[0], "owner-only group survived");
expect(!!(await db.select().from(schema.groups).where(eq(schema.groups.id, otherGroup.id)))[0], "unowned shared group was broken");
expect(!(await db.select().from(schema.groupPosts).where(eq(schema.groupPosts.id, deletedPost.id)))[0], "authored post survived");
expect(!!(await db.select().from(schema.groupPosts).where(eq(schema.groupPosts.id, survivingPost.id)))[0], "another author's post was deleted");
const remainingComments = await db.select().from(schema.groupPostComments).where(eq(schema.groupPostComments.postId, survivingPost.id));
expect(remainingComments.length === 1 && remainingComments[0].authorUserId === ordinaryMember.id, "comment ownership cleanup was wrong");
const remainingReactions = await db.select().from(schema.groupPostReactions).where(eq(schema.groupPostReactions.postId, survivingPost.id));
expect(remainingReactions.length === 1 && remainingReactions[0].userId === ordinaryMember.id, "reaction ownership cleanup was wrong");
expect((await db.select().from(schema.groupInvitations).where(eq(schema.groupInvitations.groupId, otherGroup.id))).length === 0, "user-linked invitations survived");
expect((await db.select().from(schema.groupFavorites).where(eq(schema.groupFavorites.userId, owner.id))).length === 0, "favorite survived");
const [redactedModerationRecord] = await db.select().from(schema.contentReports).where(eq(schema.contentReports.id, moderationRecord.id));
expect(redactedModerationRecord?.authorUserId === null, "moderation record still identifies the deleted author");
expect(redactedModerationRecord?.excerpt === "[deleted with account]" && redactedModerationRecord.href === null, "moderation snapshot retained deleted UGC");
const [keptGroupReport] = await db.select().from(schema.contentReports).where(eq(schema.contentReports.id, survivingGroupReport.id));
expect(keptGroupReport?.authorUserId === null, "inherited group report retained the deleted owner id");
expect(keptGroupReport?.status === "open" && keptGroupReport.excerpt === "Inherited group snapshot" && keptGroupReport.href === `/g/${survivingGroup.slug}`, "inherited group report lost its live moderation context");
const [removedGroupReport] = await db.select().from(schema.contentReports).where(eq(schema.contentReports.id, deletedGroupReport.id));
expect(removedGroupReport?.status === "removed" && removedGroupReport.excerpt === "[deleted with account]" && removedGroupReport.href === null, "deleted group report was left open or unredacted");
const remainingNotifications = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, outsider.id));
expect(remainingNotifications.length === 1 && remainingNotifications[0].type === "follow", "copied group message survived deletion");
expect(remainingNotifications[0].actorUserId === null, "non-UGC notification was not de-attributed");

const expectedDeleted = [
  urls.profile,
  urls.background,
  urls.classOnly,
  urls.template,
  urls.personal,
  urls.groupDeleted,
].sort();
expect(JSON.stringify(deletionCall) === JSON.stringify(expectedDeleted), `wrong blob GC set:\n${deletionCall.join("\n")}`);
for (const kept of [urls.thumbKeptByEvent, urls.classKeptByClass, urls.classKeptByStandardWeek, urls.groupKept]) {
  expect(!deletionCall.includes(kept), `still-referenced blob was scheduled: ${kept}`);
}

// Provider failure is post-commit and best-effort, never a relational rollback.
const [failureUser] = await db.insert(schema.users).values({
  email: "purge-provider-failure@example.com",
  photo: urls.cleanupFailure,
}).returning();
const originalConsoleError = console.error;
console.error = () => undefined;
try {
  await purgeUser(
    db as unknown as Awaited<ReturnType<typeof getDb>>,
    failureUser.id,
    { deleteImages: async () => { throw new Error("provider unavailable"); } },
  );
} finally {
  console.error = originalConsoleError;
}
expect(!(await db.select().from(schema.users).where(eq(schema.users.id, failureUser.id)))[0], "blob failure rolled back account deletion");

await client.close();
console.log("PURGE CHECKS PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
