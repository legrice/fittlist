import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { deleteStoredImages, managedBlobUrl } from "@/lib/storage";

type Database = Awaited<ReturnType<typeof getDb>>;
type ImageDeleter = (urls: Iterable<string>) => Promise<void>;

export type PurgeUserOptions = {
  /** Test seam; production uses the Vercel Blob deleter. */
  deleteImages?: ImageDeleter;
};

function addManagedUrl(target: Set<string>, value: unknown): void {
  const url = managedBlobUrl(value);
  if (url) target.add(url);
}

function addStandardWeekImages(target: Set<string>, value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const slots of Object.values(value)) {
    if (!Array.isArray(slots)) continue;
    for (const slot of slots) {
      if (!slot || typeof slot !== "object" || Array.isArray(slot)) continue;
      addManagedUrl(target, "image" in slot ? slot.image : null);
    }
  }
}

/**
 * Assets on rows that account deletion may remove. Shared catalog/place/event
 * assets are intentionally absent: those rows survive and their references
 * are rechecked below. An owned group photo is a candidate because an empty
 * group is deleted, but the same URL is retained when another member inherits
 * the group.
 */
async function userImageCandidates(database: Database, userId: string): Promise<Set<string>> {
  const [people, classes, templates, personal, groups] = await Promise.all([
    database
      .select({
        photo: schema.users.photo,
        photoThumb: schema.users.photoThumb,
        storyPrefs: schema.users.storyPrefs,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId)),
    database
      .select({ image: schema.classes.image })
      .from(schema.classes)
      .where(eq(schema.classes.userId, userId)),
    database
      .select({ image: schema.classTemplates.image })
      .from(schema.classTemplates)
      .where(eq(schema.classTemplates.userId, userId)),
    database
      .select({ image: schema.personalClasses.image })
      .from(schema.personalClasses)
      .where(eq(schema.personalClasses.userId, userId)),
    database
      .select({ photo: schema.groups.photo })
      .from(schema.groups)
      .where(eq(schema.groups.ownerUserId, userId)),
  ]);

  const urls = new Set<string>();
  for (const person of people) {
    addManagedUrl(urls, person.photo);
    addManagedUrl(urls, person.photoThumb);
    addManagedUrl(urls, person.storyPrefs?.background);
  }
  for (const row of [...classes, ...templates, ...personal]) addManagedUrl(urls, row.image);
  for (const group of groups) addManagedUrl(urls, group.photo);
  return urls;
}

/** Every live database reference to a Vercel Blob image, in one inventory. */
async function referencedImageUrls(database: Database): Promise<Set<string>> {
  const [people, studios, events, templates, catalog, classes, personal, groups] =
    await Promise.all([
      database.select({
        photo: schema.users.photo,
        photoThumb: schema.users.photoThumb,
        storyPrefs: schema.users.storyPrefs,
      }).from(schema.users),
      database.select({ photo: schema.studios.photo, standardWeek: schema.studios.standardWeek }).from(schema.studios),
      database.select({ photo: schema.events.photo }).from(schema.events),
      database.select({ image: schema.classTemplates.image }).from(schema.classTemplates),
      database.select({ image: schema.studioClasses.image }).from(schema.studioClasses),
      database.select({ image: schema.classes.image }).from(schema.classes),
      database.select({ image: schema.personalClasses.image }).from(schema.personalClasses),
      database.select({ photo: schema.groups.photo }).from(schema.groups),
    ]);

  const urls = new Set<string>();
  for (const person of people) {
    addManagedUrl(urls, person.photo);
    addManagedUrl(urls, person.photoThumb);
    addManagedUrl(urls, person.storyPrefs?.background);
  }
  for (const studio of studios) {
    addManagedUrl(urls, studio.photo);
    addStandardWeekImages(urls, studio.standardWeek);
  }
  for (const row of events) addManagedUrl(urls, row.photo);
  for (const row of [...templates, ...catalog, ...classes, ...personal]) addManagedUrl(urls, row.image);
  for (const group of groups) addManagedUrl(urls, group.photo);
  return urls;
}

/** Delete candidate blobs only after every surviving image-bearing table has
 * been checked. Used both by full account deletion and targeted moderation. */
export async function deleteUnreferencedStoredImages(
  database: Database,
  values: Iterable<string | null | undefined>,
  deleteImages: ImageDeleter = deleteStoredImages,
): Promise<void> {
  const candidates = new Set<string>();
  for (const value of values) addManagedUrl(candidates, value);
  if (!candidates.size) return;
  const referenced = await referencedImageUrls(database);
  const unreferenced = [...candidates].filter((url) => !referenced.has(url));
  if (unreferenced.length) await deleteImages(unreferenced);
}

/**
 * Tear down everything an account owns, then the account.
 *
 * Lifted out of `adminDeleteUser` when members got a Delete account button of
 * their own, and it has to stay one function. The order here is not
 * cosmetic: attendances point at both the account and its classes, inquiry
 * messages point at its threads, and every table with a users foreign key has
 * to appear or the whole delete fails on a constraint. A second copy of that
 * ordering would double the trap CLAUDE.md already warns about, which is that
 * adding a users FK means editing this list.
 *
 * Shared directory facts are de-attributed rather than deleted: a studio edit
 * is a fact about the studio, and an event is still happening. Authored group
 * conversation is deleted; group-level metadata and plans transfer to another
 * active member so one person's account deletion cannot break the group.
 *
 * It takes an id because both callers have already decided who: the admin
 * from the panel, and the owner from their own session. Nothing here checks
 * permission, so nothing may call it without doing that first.
 */
export async function purgeUser(
  db: Database,
  id: string,
  options: PurgeUserOptions = {},
): Promise<void> {
  // This teardown is deliberately atomic. A newly-added foreign key must not
  // leave half an account behind if its cleanup is accidentally omitted: the
  // transaction either removes the whole account or changes nothing.
  const run = async (database: typeof db) => {
  const db = database;
  // Magic links are keyed on the address rather than the account, so the
  // address has to be read before the row goes.
  const [u] = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, id));
  if (!u) return new Set<string>();
  const imageCandidates = await userImageCandidates(db as Database, id);
  // Rows the account owns — delete outright, children before parents.
  //
  // Order matters: attendances point at both the account and its classes, and
  // inquiry messages point at its threads, so those go first or the foreign
  // keys refuse the delete. Every table with a users FK has to appear here —
  // miss one and the whole delete fails with a constraint error.
  const ownClasses = await db
    .select({ id: schema.classes.id })
    .from(schema.classes)
    .where(eq(schema.classes.userId, id));
  const ownClassIds = ownClasses.map((c) => c.id);
  // Blocks in both directions: they blocked someone, someone blocked them.
  await db.delete(schema.blocks).where(eq(schema.blocks.blockerUserId, id));
  await db.delete(schema.blocks).where(eq(schema.blocks.blockedUserId, id));
  // Class reports in both directions too: ones they filed, ones about their classes.
  await db.delete(schema.classReports).where(eq(schema.classReports.reporterUserId, id));
  await db.delete(schema.classReports).where(eq(schema.classReports.coachUserId, id));
  await db.delete(schema.studioReports).where(eq(schema.studioReports.reporterUserId, id));
  // Reports they filed go with their account. Reports about their authored
  // content are retained and redacted later, preserving the moderation audit
  // trail without retaining their words or identity.
  await db.delete(schema.contentReports).where(eq(schema.contentReports.reporterUserId, id));
  await db.delete(schema.followRequests).where(eq(schema.followRequests.trainerUserId, id));
  await db.delete(schema.followRequests).where(eq(schema.followRequests.requesterUserId, id));
  // Their own private week entries, and any ask to coach.
  await db.delete(schema.personalClasses).where(eq(schema.personalClasses.userId, id));
  await db.delete(schema.coachRequests).where(eq(schema.coachRequests.userId, id));
  // "Going" marks: theirs, and anyone else's on the classes they taught.
  await db.delete(schema.attendances).where(eq(schema.attendances.userId, id));
  if (ownClassIds.length) {
    await db.delete(schema.attendances).where(inArray(schema.attendances.classId, ownClassIds));
  }
  // Delete conversations on either side of the account. Requester threads are
  // keyed by email rather than user id, but they still contain the person's
  // name, phone and messages and therefore belong in account deletion.
  const ownThreads = await db
    .select({ id: schema.inquiryThreads.id })
    .from(schema.inquiryThreads)
    .where(or(eq(schema.inquiryThreads.coachUserId, id), eq(schema.inquiryThreads.requesterEmail, u.email)));
  const ownThreadIds = ownThreads.map((t) => t.id);
  if (ownThreadIds.length) {
    await db
      .delete(schema.inquiryMessages)
      .where(inArray(schema.inquiryMessages.threadId, ownThreadIds));
  }
  if (ownThreadIds.length) {
    await db.delete(schema.inquiryThreads).where(inArray(schema.inquiryThreads.id, ownThreadIds));
  }
  await db.delete(schema.notifications).where(eq(schema.notifications.userId, id));
  // Group-update notifications copy the author's post/comment body. Keeping
  // one while merely clearing actorUserId would retain the deleted person's
  // UGC in another account, so those copies go with the authored content.
  await db
    .delete(schema.notifications)
    .where(and(eq(schema.notifications.actorUserId, id), eq(schema.notifications.type, "group_update")));
  // Notifications ABOUT them, on someone else's feed. De-attributed rather than
  // deleted: "someone followed your schedule" is still true, it just loses the
  // face and falls back to the icon.
  await db
    .update(schema.notifications)
    .set({ actorUserId: null })
    .where(eq(schema.notifications.actorUserId, id));
  await db.delete(schema.classes).where(eq(schema.classes.userId, id));
  await db.delete(schema.classTemplates).where(eq(schema.classTemplates.userId, id));
  // Pending public follows carry both the coach id and the mailbox address.
  // Remove either shape before deleting the account so a confirmation link
  // cannot outlive the identity it referenced.
  await db
    .delete(schema.emailFollowConfirmations)
    .where(
      or(
        eq(schema.emailFollowConfirmations.trainerUserId, id),
        eq(schema.emailFollowConfirmations.email, u.email),
      ),
    );
  // Their followers, and the coaches they themselves followed.
  await db.delete(schema.subscribers).where(eq(schema.subscribers.trainerUserId, id));
  await db.delete(schema.subscribers).where(eq(schema.subscribers.userId, id));
  await db.delete(schema.pageVisits).where(eq(schema.pageVisits.trainerUserId, id));
  await db.delete(schema.googleConnections).where(eq(schema.googleConnections.userId, id));
  await db.delete(schema.credentials).where(eq(schema.credentials.userId, id));
  await db.delete(schema.coachStudios).where(eq(schema.coachStudios.userId, id));
  await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, id));
  await db.delete(schema.eventAttendances).where(eq(schema.eventAttendances.userId, id));
  await db.delete(schema.calendarPins).where(eq(schema.calendarPins.userId, id));
  await db.delete(schema.magicLinks).where(eq(schema.magicLinks.email, u.email));
  await db.delete(schema.authCodes).where(eq(schema.authCodes.email, u.email));
  await db.delete(schema.messageLog).where(eq(schema.messageLog.toAddress, u.email));
  await db.delete(schema.inviteRequests).where(eq(schema.inviteRequests.email, u.email));
  await db.delete(schema.studioSuggestions).where(eq(schema.studioSuggestions.email, u.email));
  // Plain-email follows predate account-backed subscriptions and may have no
  // userId to cascade from.
  await db.delete(schema.subscribers).where(eq(schema.subscribers.email, u.email));
  await db.delete(schema.invites).where(eq(schema.invites.email, u.email));

  // Shared records they created — keep, just drop the attribution FK.
  // Their shifts come off the rota rather than going with them: the gym owns
  // those classes, and a coach leaving turns their slots back into open ones
  // for somebody else to pick up.
  await db
    .update(schema.classes)
    .set({ coachUserId: null })
    .where(eq(schema.classes.coachUserId, id));
  await db
    .update(schema.shiftCovers)
    .set({ coachUserId: null })
    .where(eq(schema.shiftCovers.coachUserId, id));
  await db
    .update(schema.shiftCovers)
    .set({ createdByUserId: null })
    .where(eq(schema.shiftCovers.createdByUserId, id));
  await db
    .update(schema.studioClosedDays)
    .set({ createdByUserId: null })
    .where(eq(schema.studioClosedDays.createdByUserId, id));
  // Their keys go with them; a page they ran alone returns to the commons
  // rather than being left locked with nobody holding it. Their place on any
  // gym's shift list goes too: a list naming somebody who left is a hand-off
  // to nobody.
  await db.delete(schema.studioRotaCoaches).where(eq(schema.studioRotaCoaches.userId, id));
  // Any shift change they were part of goes with them. A request naming
  // somebody who left is an ask nobody can answer and a hand-off to nobody,
  // so both directions are deleted rather than de-attributed; the decider is
  // only cleared, because an answered request is a fact about the studio.
  await db.delete(schema.shiftRequests).where(eq(schema.shiftRequests.toUserId, id));
  await db.delete(schema.shiftRequests).where(eq(schema.shiftRequests.fromUserId, id));
  await db
    .update(schema.shiftRequests)
    .set({ decidedByUserId: null })
    .where(eq(schema.shiftRequests.decidedByUserId, id));
  const ownedStudios = await db
    .select({ id: schema.studios.id })
    .from(schema.studios)
    .where(eq(schema.studios.ownerUserId, id));
  for (const studio of ownedStudios) {
    const [nextOwner] = await db
      .select({ userId: schema.studioManagers.userId })
      .from(schema.studioManagers)
      .where(
        and(
          eq(schema.studioManagers.studioId, studio.id),
          ne(schema.studioManagers.userId, id),
        ),
      )
      .orderBy(schema.studioManagers.createdAt)
      .limit(1);
    await db
      .update(schema.studios)
      .set({ ownerUserId: nextOwner?.userId ?? null })
      .where(eq(schema.studios.id, studio.id));
  }
  await db.delete(schema.studioManagers).where(eq(schema.studioManagers.userId, id));
  await db
    .update(schema.studioManagers)
    .set({ addedByUserId: null })
    .where(eq(schema.studioManagers.addedByUserId, id));
  await db.update(schema.studios).set({ createdByUserId: null }).where(eq(schema.studios.createdByUserId, id));
  // Their studio edits stay: the edit is a fact about the studio, it just
  // loses its author.
  await db.update(schema.studioEdits).set({ editorUserId: null }).where(eq(schema.studioEdits.editorUserId, id));
  // Events they posted stay too: the expo is still happening.
  await db.update(schema.events).set({ createdByUserId: null }).where(eq(schema.events.createdByUserId, id));
  await db.update(schema.studioClasses).set({ createdByUserId: null }).where(eq(schema.studioClasses.createdByUserId, id));
  await db.update(schema.customClassTypes).set({ createdByUserId: null }).where(eq(schema.customClassTypes.createdByUserId, id));
  await db.update(schema.invites).set({ invitedByUserId: null }).where(eq(schema.invites.invitedByUserId, id));
  await db.update(schema.invites).set({ acceptedUserId: null, acceptedAt: null }).where(eq(schema.invites.acceptedUserId, id));

  // Authored group conversation is personal UGC, even though it was posted in
  // a shared space. Deleting a post also cascades its thread (including other
  // people's replies and reactions, which have no standalone meaning); their
  // comments and reactions on posts that remain are removed separately.
  await db.delete(schema.groupPosts).where(eq(schema.groupPosts.authorUserId, id));
  await db.delete(schema.groupPostComments).where(eq(schema.groupPostComments.authorUserId, id));
  await db.delete(schema.groupPostReactions).where(eq(schema.groupPostReactions.userId, id));
  await db.delete(schema.groupInvitations).where(eq(schema.groupInvitations.inviteeUserId, id));
  await db.delete(schema.groupInvitations).where(eq(schema.groupInvitations.invitedByUserId, id));
  await db.delete(schema.groupFavorites).where(eq(schema.groupFavorites.userId, id));
  // Keep the moderation decision/audit record, but not a point-in-time copy of
  // content the author has now deleted with their account.
  await db
    .update(schema.contentReports)
    .set({ authorUserId: null, excerpt: "[deleted with account]", subject: "Deleted content", href: null })
    .where(and(eq(schema.contentReports.authorUserId, id), ne(schema.contentReports.contentType, "group")));

  // Social proof about a deleted person no longer has a subject, while proof
  // they left on somebody else's profile cannot keep its non-null author FK.
  await db.delete(schema.profileEndorsements).where(eq(schema.profileEndorsements.targetUserId, id));
  await db.delete(schema.profileEndorsements).where(eq(schema.profileEndorsements.endorserUserId, id));
  await db.delete(schema.studioEndorsements).where(eq(schema.studioEndorsements.endorserUserId, id));
  await db.delete(schema.shoutouts).where(eq(schema.shoutouts.targetUserId, id));
  await db.delete(schema.shoutouts).where(eq(schema.shoutouts.authorUserId, id));

  // Group metadata, photo and calendar are group-owned shared state rather
  // than an author's post. Keep them when an active member can inherit them,
  // preferring an existing admin and then the longest-standing member. An
  // empty group has nobody who could ever reach or manage it, so delete it and
  // let its cascading children (and, after commit, its unreferenced photo) go.
  const ownedGroups = await db
    .select({ id: schema.groups.id })
    .from(schema.groups)
    .where(eq(schema.groups.ownerUserId, id));
  for (const group of ownedGroups) {
    const [successor] = await db
      .select({ userId: schema.groupMembers.userId })
      .from(schema.groupMembers)
      .where(and(eq(schema.groupMembers.groupId, group.id), ne(schema.groupMembers.userId, id)))
      .orderBy(
        sql`case when ${schema.groupMembers.role} = 'admin' then 0 else 1 end`,
        schema.groupMembers.createdAt,
        schema.groupMembers.userId,
      )
      .limit(1);
    if (successor) {
      await db.update(schema.groups).set({ ownerUserId: successor.userId }).where(eq(schema.groups.id, group.id));
      await db
        .update(schema.groupMembers)
        .set({ role: "owner" })
        .where(and(eq(schema.groupMembers.groupId, group.id), eq(schema.groupMembers.userId, successor.userId)));
    } else {
      await db
        .update(schema.contentReports)
        .set({
          authorUserId: null,
          excerpt: "[deleted with account]",
          subject: "Deleted group",
          href: null,
          status: "removed",
          handledAt: new Date(),
        })
        .where(and(eq(schema.contentReports.contentType, "group"), eq(schema.contentReports.contentId, group.id)));
      await db.delete(schema.groups).where(eq(schema.groups.id, group.id));
    }
  }
  await db.delete(schema.groupMembers).where(eq(schema.groupMembers.userId, id));

  await db.delete(schema.users).where(eq(schema.users.id, id));
  return imageCandidates;
  };

  const imageCandidates = await db.transaction(async (tx) => run(tx as unknown as typeof db));

  // Provider I/O must happen only after the relational teardown commits. A
  // rollback therefore never loses an image, and a URL copied into a shared
  // catalog, standard week, surviving group, or another account is retained.
  // Blob cleanup is best-effort: an unavailable provider must not resurrect a
  // deleted account or turn a successful deletion into a misleading failure.
  if (imageCandidates.size) {
    try {
      await deleteUnreferencedStoredImages(db, imageCandidates, options.deleteImages ?? deleteStoredImages);
    } catch (error) {
      console.error("account image cleanup failed after database deletion", { userId: id, error });
    }
  }
}
