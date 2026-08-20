import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";

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
 * Shared rows are de-attributed rather than deleted: a studio edit is a fact
 * about the studio, an event is still happening, and "someone followed your
 * schedule" survives its subject leaving.
 *
 * It takes an id because both callers have already decided who: the admin
 * from the panel, and the owner from their own session. Nothing here checks
 * permission, so nothing may call it without doing that first.
 */
export async function purgeUser(
  db: Awaited<ReturnType<typeof getDb>>,
  id: string,
): Promise<void> {
  // Magic links are keyed on the address rather than the account, so the
  // address has to be read before the row goes.
  const [u] = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, id));
  if (!u) return;
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
  const ownThreads = await db
    .select({ id: schema.inquiryThreads.id })
    .from(schema.inquiryThreads)
    .where(eq(schema.inquiryThreads.coachUserId, id));
  const ownThreadIds = ownThreads.map((t) => t.id);
  if (ownThreadIds.length) {
    await db
      .delete(schema.inquiryMessages)
      .where(inArray(schema.inquiryMessages.threadId, ownThreadIds));
  }
  await db.delete(schema.inquiryThreads).where(eq(schema.inquiryThreads.coachUserId, id));
  await db.delete(schema.notifications).where(eq(schema.notifications.userId, id));
  // Notifications ABOUT them, on someone else's feed. De-attributed rather than
  // deleted: "someone followed your schedule" is still true, it just loses the
  // face and falls back to the icon.
  await db
    .update(schema.notifications)
    .set({ actorUserId: null })
    .where(eq(schema.notifications.actorUserId, id));
  await db.delete(schema.classes).where(eq(schema.classes.userId, id));
  await db.delete(schema.classTemplates).where(eq(schema.classTemplates.userId, id));
  // Their followers, and the coaches they themselves followed.
  await db.delete(schema.subscribers).where(eq(schema.subscribers.trainerUserId, id));
  await db.delete(schema.subscribers).where(eq(schema.subscribers.userId, id));
  await db.delete(schema.pageVisits).where(eq(schema.pageVisits.trainerUserId, id));
  await db.delete(schema.googleConnections).where(eq(schema.googleConnections.userId, id));
  await db.delete(schema.credentials).where(eq(schema.credentials.userId, id));
  await db.delete(schema.coachStudios).where(eq(schema.coachStudios.userId, id));
  await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, id));
  await db.delete(schema.eventAttendances).where(eq(schema.eventAttendances.userId, id));
  await db.delete(schema.magicLinks).where(eq(schema.magicLinks.email, u.email));

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

  await db.delete(schema.users).where(eq(schema.users.id, id));
}
