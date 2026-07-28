"use server";

import { eq, inArray, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { adminEmails, currentAdmin } from "@/lib/admin";
import { sendInviteLink } from "@/lib/invite-link";
import { normalizeLocation } from "@/lib/location";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  await db.delete(schema.studioClasses).where(eq(schema.studioClasses.studioId, id));
  await db.delete(schema.studios).where(eq(schema.studios.id, id));
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
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, id));
  if (!u) return { ok: false, error: "User not found." };
  if (adminEmails().includes(u.email.toLowerCase())) {
    return { ok: false, error: "Can't delete an admin account." };
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
  await db.delete(schema.classes).where(eq(schema.classes.userId, id));
  await db.delete(schema.classTemplates).where(eq(schema.classTemplates.userId, id));
  // Their followers, and the coaches they themselves followed.
  await db.delete(schema.subscribers).where(eq(schema.subscribers.trainerUserId, id));
  await db.delete(schema.subscribers).where(eq(schema.subscribers.userId, id));
  await db.delete(schema.pageVisits).where(eq(schema.pageVisits.trainerUserId, id));
  await db.delete(schema.googleConnections).where(eq(schema.googleConnections.userId, id));
  await db.delete(schema.credentials).where(eq(schema.credentials.userId, id));
  await db.delete(schema.coachStudios).where(eq(schema.coachStudios.userId, id));
  await db.delete(schema.magicLinks).where(eq(schema.magicLinks.email, u.email));

  // Shared records they created — keep, just drop the attribution FK.
  await db.update(schema.studios).set({ createdByUserId: null }).where(eq(schema.studios.createdByUserId, id));
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
