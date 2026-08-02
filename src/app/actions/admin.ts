"use server";

import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { adminEmails, currentAdmin } from "@/lib/admin";
import { addNotification } from "@/lib/notify";
import { sendInviteLink } from "@/lib/invite-link";
import { normalizeLocation } from "@/lib/location";

// Opening the Activity list is what "seen" means; the header badge counts
// from here.
export async function adminMarkActivitySeen(): Promise<{ ok: boolean }> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false };
  const db = await getDb();
  await db
    .update(schema.users)
    .set({ adminActivityAt: new Date() })
    .where(eq(schema.users.id, admin.id));
  revalidatePath("/admin");
  return { ok: true };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Put a picture on any class, from the class sheet. A beta-era power, held by
// the admin alone: most classes were typed in before pictures existed, and a
// coach who never opens the editor is not going to add one. It changes a
// picture and nothing else: no words, no times, nothing a coach would need to
// be asked about first.
//
// The picture lands on every class with this title under the same owner, not
// just this series: a coach teaching Stretch+ at two studios has two series
// that are the same class, and a photo on one of them left its twin bare. It
// also lands on the owner's template (the autofill memory, so re-adding the
// class brings it back) and on each touched studio's catalog row, so the next
// person to pull the class in gets it too. It stops at the owner: two coaches
// can both teach a "Yoga Flow" that are different classes, and one must not
// inherit the other's photograph.
export async function adminSetClassImage(
  classId: string,
  image: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, error: "Not allowed." };
  const db = await getDb();
  const [c] = await db.select().from(schema.classes).where(eq(schema.classes.id, classId));
  if (!c) return { ok: false, error: "That class isn't there any more." };
  const img = image?.trim() || null;
  const sameTitle = and(
    eq(schema.classes.userId, c.userId),
    sql`lower(${schema.classes.name}) = ${c.name.toLowerCase()}`,
  );
  const touched = await db
    .update(schema.classes)
    .set({ image: img })
    .where(sameTitle)
    .returning({ studioId: schema.classes.studioId });
  await db
    .update(schema.classTemplates)
    .set({ image: img })
    .where(
      and(
        eq(schema.classTemplates.userId, c.userId),
        sql`lower(${schema.classTemplates.name}) = ${c.name.toLowerCase()}`,
      ),
    );
  // Removal clears the catalog too: leaving the old picture there means it
  // comes straight back on the next pull, which makes Remove a lie.
  const studioIds = [...new Set(touched.map((t) => t.studioId))].filter(
    (id): id is string => !!id,
  );
  if (studioIds.length) {
    await db
      .update(schema.studioClasses)
      .set({ image: img, updatedAt: new Date() })
      .where(
        and(
          inArray(schema.studioClasses.studioId, studioIds),
          eq(schema.studioClasses.nameKey, c.name.toLowerCase()),
        ),
      );
  }
  return { ok: true };
}

// Rewrite every stored location into the canonical "City, ST".
//
// Rows written before normalization existed still show up as separate chips in
// Discover. Two passes on purpose: the first canonicalizes everything that
// already names a state, and only then does the second try to snap a bare city
// onto the set that produces. Doing it in one pass would match against a list
// that's still half-messy.
export async function adminFixLocations(): Promise<{
  ok: boolean;
  changed?: { from: string; to: string }[];
  stuck?: { email: string; location: string }[];
  error?: string;
}> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  const db = await getDb();
  const rows = await db
    .select({ id: schema.users.id, email: schema.users.email, location: schema.users.location })
    .from(schema.users)
    .where(isNotNull(schema.users.location));

  const target = new Map<string, string>();
  const leftover: typeof rows = [];
  for (const r of rows) {
    const res = normalizeLocation(r.location);
    if (res.ok && res.value) target.set(r.id, res.value);
    else leftover.push(r);
  }
  const canonical = [...new Set(target.values())];
  const stuck: { email: string; location: string }[] = [];
  for (const r of leftover) {
    const res = normalizeLocation(r.location, canonical);
    if (res.ok && res.value) target.set(r.id, res.value);
    else stuck.push({ email: r.email, location: r.location! });
  }

  const changed: { from: string; to: string }[] = [];
  for (const r of rows) {
    const to = target.get(r.id);
    if (!to || to === r.location) continue;
    await db.update(schema.users).set({ location: to }).where(eq(schema.users.id, r.id));
    changed.push({ from: r.location!, to });
  }
  revalidatePath("/admin");
  revalidatePath("/discover");
  return { ok: true, changed, stuck };
}

// Add a studio straight to the shared directory from the admin panel.
export async function adminAddStudio(
  nameRaw: string,
  addressRaw: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  const name = nameRaw.trim();
  const address = addressRaw.trim();
  if (!name) return { ok: false, error: "Enter the studio name." };
  if (!address) return { ok: false, error: "Enter the address." };
  const db = await getDb();
  await db.insert(schema.studios).values({ name, address, createdByUserId: admin.id });
  revalidatePath("/admin");
  return { ok: true };
}

// Flip which side of the app an account is on. Member -> coach is the same
// thing Start coaching does, done for them. Coach -> member also unpublishes
// their public classes: the coach-only gate guards the door, and demoting
// somebody who walked through it earlier must not leave their inventory
// standing in the directory. Their rows stay (private), so flipping them back
// restores nothing silently; they republish on purpose.
export async function adminSetKind(
  id: string,
  kind: "coach" | "fan",
): Promise<{ ok: boolean; error?: string }> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  if (id === admin.id) return { ok: false, error: "You can't change your own account." };
  const db = await getDb();
  const [u] = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, id));
  if (!u) return { ok: false, error: "User not found." };
  if (adminEmails().includes(u.email.toLowerCase()))
    return { ok: false, error: "Can't change an admin account." };
  await db.update(schema.users).set({ kind }).where(eq(schema.users.id, id));
  if (kind === "fan") {
    await db
      .update(schema.classes)
      .set({ isPublic: false })
      .where(eq(schema.classes.userId, id));
  }
  revalidatePath("/admin");
  return { ok: true };
}

// Clear a stale invite. Pending only: an accepted one is the referral record
// ("who brought whom"), and deleting it would quietly rewrite history. The
// email loses its gate pass; if they never used it, nothing else changes.
export async function adminDeleteInvite(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  const db = await getDb();
  const [inv] = await db.select().from(schema.invites).where(eq(schema.invites.id, id));
  if (!inv) return { ok: false, error: "Invite not found." };
  if (inv.acceptedAt) return { ok: false, error: "They already joined; the invite is history now." };
  await db.delete(schema.invites).where(eq(schema.invites.id, id));
  revalidatePath("/admin");
  return { ok: true };
}

// Answer a member's ask to coach. Approving flips their kind (same rules as
// adminSetKind) and tells them; dismissing just closes the ask, quietly.
export async function adminAnswerCoachRequest(
  requestId: string,
  approve: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  const db = await getDb();
  const [req] = await db
    .select()
    .from(schema.coachRequests)
    .where(eq(schema.coachRequests.id, requestId));
  if (!req) return { ok: false, error: "Request not found." };
  if (req.handledAt) return { ok: true };

  if (approve) {
    await db.update(schema.users).set({ kind: "coach" }).where(eq(schema.users.id, req.userId));
    try {
      const { addNotification } = await import("@/lib/notify");
      await addNotification(req.userId, {
        type: "coach_approved",
        title: "You're a coach now",
        body: "Your schedule is live the moment you add your first class.",
      });
    } catch (err) {
      console.error("coach approval notification failed", err);
    }
  }
  await db
    .update(schema.coachRequests)
    .set({ handledAt: new Date() })
    .where(eq(schema.coachRequests.id, requestId));
  revalidatePath("/admin");
  return { ok: true };
}

// Mint a one-time sign-in link for a coach and email it. Returns the URL too so
// the admin can copy it and send it any way they like (handy while email
// delivery is still flaky in beta). Admin links last 24h, not the usual 15 min.
export async function adminSendMagicLink(
  emailRaw: string,
): Promise<{ ok: boolean; url?: string; emailed?: boolean; error?: string }> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "That doesn't look like an email address." };

  const url = await sendInviteLink({
    email,
    subject: "Sign in to fittlist",
    intro: "Tap to sign in to fittlist:",
  });
  return { ok: true, url, emailed: true };
}

// Hand a studio's page to the people who run it. The first one claims it: from
// then on the directory's open-to-any-coach rule stops applying and only these
// people (and an admin) may edit. Adding a second is how an owner and a manager
// both get the keys without either being able to lock the other out.
export async function adminAddStudioManager(
  studioId: string,
  emailRaw: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  const email = emailRaw.trim().toLowerCase();
  if (!email) return { ok: false, error: "Enter their email." };
  const db = await getDb();

  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!user) return { ok: false, error: "Nobody with that email has an account yet." };
  const [studio] = await db.select().from(schema.studios).where(eq(schema.studios.id, studioId));
  if (!studio) return { ok: false, error: "Studio not found." };

  const already = await db
    .select({ id: schema.studioManagers.id })
    .from(schema.studioManagers)
    .where(
      and(
        eq(schema.studioManagers.studioId, studioId),
        eq(schema.studioManagers.userId, user.id),
      ),
    );
  if (already.length) return { ok: false, error: "They already run this page." };

  await db
    .insert(schema.studioManagers)
    .values({ studioId, userId: user.id, addedByUserId: admin.id });
  // Being handed the keys is not something to discover by accident.
  await addNotification(user.id, {
    type: "studio_manager",
    title: `You run ${studio.name} on fittlist`,
    body: "You can edit its page, and its details are yours to state.",
    href: `/s/${studio.slug ?? studio.id}`,
  });
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  revalidatePath("/admin");
  return { ok: true };
}

// Give a claimed studio its own account, which is what lets it run a schedule.
// A users row with kind "gym": no handle, no password, no way to sign in. It
// exists to own the gym's classes so they can be public without belonging to
// any one person, which is what lets a coach take shifts while staying off the
// public side entirely. Its managers act for it.
export async function adminEnableStudioSchedule(
  studioId: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  const db = await getDb();
  const [studio] = await db.select().from(schema.studios).where(eq(schema.studios.id, studioId));
  if (!studio) return { ok: false, error: "Studio not found." };
  if (studio.accountUserId) return { ok: false, error: "It already has one." };

  const managers = await db
    .select({ id: schema.studioManagers.id })
    .from(schema.studioManagers)
    .where(eq(schema.studioManagers.studioId, studioId));
  if (!managers.length)
    return { ok: false, error: "Hand the page to somebody first: a rota needs someone to run it." };

  // An address nobody can receive mail at or sign up with, so the account can
  // never be logged into and never collides with a real person's email.
  const [account] = await db
    .insert(schema.users)
    .values({
      kind: "gym",
      email: `studio.${studio.id}@gym.fittlist.invalid`,
      name: studio.name,
      // No handle: a gym lives at /s/{slug}, not at /{handle}, and the handle
      // is also what keeps it out of Discover's people list.
      handle: null,
      discoverable: false,
      onboardedAt: new Date(),
    })
    .returning();
  await db
    .update(schema.studios)
    .set({ accountUserId: account.id })
    .where(eq(schema.studios.id, studioId));
  revalidatePath(`/s/${studio.slug ?? studio.id}`);
  revalidatePath("/admin");
  return { ok: true };
}

/** Take the keys back. The last one leaving returns the page to the commons. */
export async function adminRemoveStudioManager(
  studioId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  const db = await getDb();
  const [studio] = await db.select().from(schema.studios).where(eq(schema.studios.id, studioId));
  await db
    .delete(schema.studioManagers)
    .where(
      and(eq(schema.studioManagers.studioId, studioId), eq(schema.studioManagers.userId, userId)),
    );
  if (studio) revalidatePath(`/s/${studio.slug ?? studio.id}`);
  revalidatePath("/admin");
  return { ok: true };
}

// Remove a studio from the shared directory. Only allowed when nothing depends
// on it (no classes, templates, or coach associations) so we never orphan data;
// a studio that's in use should be edited, not deleted.
export async function adminDeleteStudio(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  const db = await getDb();

  const inUse =
    (await db.select({ x: schema.classes.id }).from(schema.classes).where(eq(schema.classes.studioId, id)).limit(1)).length ||
    (await db.select({ x: schema.classTemplates.id }).from(schema.classTemplates).where(eq(schema.classTemplates.studioId, id)).limit(1)).length ||
    (await db.select({ x: schema.coachStudios.studioId }).from(schema.coachStudios).where(eq(schema.coachStudios.studioId, id)).limit(1)).length;
  if (inUse) {
    return { ok: false, error: "This studio is in use by a class or coach. Edit it instead of deleting." };
  }

  // studio_classes are just catalog groundwork — safe to clear before removing.
  // The edit history and the keys go with the studio they describe.
  await db.delete(schema.studioManagers).where(eq(schema.studioManagers.studioId, id));
  await db.delete(schema.studioEdits).where(eq(schema.studioEdits.studioId, id));
  await db.delete(schema.studioClasses).where(eq(schema.studioClasses.studioId, id));
  const [gone] = await db.select().from(schema.studios).where(eq(schema.studios.id, id));
  await db.delete(schema.studios).where(eq(schema.studios.id, id));
  // The gym's account exists only to own this studio's classes, and the check
  // above proved there are none left, so it goes with the studio rather than
  // sitting in the users table as a row nobody can reach.
  if (gone?.accountUserId)
    await db.delete(schema.users).where(eq(schema.users.id, gone.accountUserId));
  revalidatePath("/admin");
  return { ok: true };
}

// Delete a coach and everything owned by their account (classes, templates,
// subscribers, visits, calendar link, passkeys, studio associations). Shared
// records they merely created (studios, catalog, types, invites) are kept but
// de-attributed. Can't delete yourself or another admin.
export async function adminDeleteUser(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  if (id === admin.id) return { ok: false, error: "You can't delete your own account." };
  const db = await getDb();
  const [u] = await db
    .select({ email: schema.users.email, kind: schema.users.kind })
    .from(schema.users)
    .where(eq(schema.users.id, id));
  if (!u) return { ok: false, error: "User not found." };
  if (adminEmails().includes(u.email.toLowerCase())) {
    return { ok: false, error: "Can't delete an admin account." };
  }
  // A gym's account isn't a person and this path would take its whole schedule
  // with it. Deleting the studio is the way to do that, deliberately.
  if (u.kind === "gym") {
    return { ok: false, error: "That's a studio's account. Remove the studio instead." };
  }

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
  // rather than being left locked with nobody holding it.
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
  revalidatePath("/admin");
  return { ok: true };
}

// Invite a coach by email (invite-only beta gate) and email them a sign-in link
// so they can join right away. Returns the link so the admin can copy it too.
export async function adminInvite(
  emailRaw: string,
  labelRaw: string,
): Promise<{ ok: boolean; url?: string; emailed?: boolean; error?: string }> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "That doesn't look like an email address." };
  const label = labelRaw.trim().slice(0, 120) || null;

  const db = await getDb();
  await db
    .insert(schema.invites)
    .values({ email, label, invitedByUserId: admin.id })
    .onConflictDoUpdate({ target: schema.invites.email, set: { label } });

  const url = await sendInviteLink({
    email: email,
    subject: "You're invited to the fittlist beta",
    intro:
      "You lucky duck. You've been invited to test out the beta version of fittlist before it's public. Tap to set up your page:",
    invite: true,
  });
  revalidatePath("/admin");
  return { ok: true, url, emailed: true };
}

// Act on a "request an invite" submission: invite them (creates the invite +
// emails a link) or just dismiss it. Either way the request is marked handled.
export async function adminActOnRequest(
  id: string,
  action: "invite" | "dismiss",
): Promise<{ ok: boolean; url?: string; emailed?: boolean; error?: string }> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  const db = await getDb();
  const [req] = await db
    .select()
    .from(schema.inviteRequests)
    .where(eq(schema.inviteRequests.id, id));
  if (!req) return { ok: false, error: "Request not found." };

  await db
    .update(schema.inviteRequests)
    .set({ handledAt: new Date() })
    .where(eq(schema.inviteRequests.id, id));

  if (action === "dismiss") {
    revalidatePath("/admin");
    return { ok: true };
  }

  const label = req.name?.trim() || null;
  await db
    .insert(schema.invites)
    .values({ email: req.email, label, invitedByUserId: admin.id })
    .onConflictDoUpdate({ target: schema.invites.email, set: { label } });
  const url = await sendInviteLink({
    email: req.email,
    subject: "You're invited to the fittlist beta",
    intro:
      "You lucky duck. You've been invited to test out the beta version of fittlist before it's public. Tap to set up your page:",
    invite: true,
  });
  revalidatePath("/admin");
  return { ok: true, url, emailed: true };
}

// A note from fittlist itself, into the Updates feed. One person by handle or
// email, all coaches, all members, or everyone. In-app only: an announcement
// is app news, and app news belongs where the bell already points. No actor,
// so it renders with the megaphone rather than a face; the megaphone IS the
// fittlist account.
export async function adminBroadcast(
  audience: "everyone" | "coaches" | "members" | "one",
  targetRaw: string,
  titleRaw: string,
  bodyRaw: string,
): Promise<{ ok: boolean; sent?: number; error?: string }> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  const title = titleRaw.trim().slice(0, 80);
  const body = bodyRaw.trim().slice(0, 500);
  if (!title) return { ok: false, error: "Give it a title." };

  const db = await getDb();
  let targets: { id: string }[];
  if (audience === "one") {
    const t = targetRaw.trim().toLowerCase().replace(/^@/, "");
    if (!t) return { ok: false, error: "Whose handle or email?" };
    targets = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(or(eq(schema.users.handle, t), eq(schema.users.email, t)));
    if (!targets.length) return { ok: false, error: "Nobody by that handle or email." };
  } else {
    const rows = await db
      .select({ id: schema.users.id, kind: schema.users.kind })
      .from(schema.users);
    targets = rows.filter((r) =>
      audience === "coaches" ? r.kind !== "fan" : audience === "members" ? r.kind === "fan" : true,
    );
  }
  // Not to yourself: you wrote it.
  targets = targets.filter((t) => t.id !== admin.id);
  if (!targets.length) return { ok: false, error: "Nobody to send that to." };

  await db.insert(schema.notifications).values(
    targets.map((t) => ({
      userId: t.id,
      type: "announce",
      title,
      body,
    })),
  );
  // The bell badge is in every header, so everything cached goes.
  revalidatePath("/", "layout");
  return { ok: true, sent: targets.length };
}
