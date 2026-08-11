"use server";

import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import type { BookingLink } from "@/db/schema";
import { storeImage } from "@/lib/storage";
import { purgeUser } from "@/lib/purge";
import { PLACEHOLDER_KIND } from "@/lib/roster";
import { adminEmails, currentAdmin } from "@/lib/admin";
import { detectProvider } from "@/lib/format";
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

/** ADMIN — everything the coach's own editor needs to open on somebody
 *  else's class: the full prefill (the series' days included) and the
 *  adder's ingredients. The half-editor this replaces edited four fields
 *  in place; the full form goes through `updateClass`, which carries the
 *  same acting-as-owner bypass `deleteClass` does, so the save is the
 *  coach's own save under the coach's own name. Null for a gym's class:
 *  its rows are rota slots and are managed there. */
export async function adminClassEditor(classId: string): Promise<{
  prefill: {
    name: string;
    classType: string | null;
    description: string | null;
    image: string | null;
    startTime: string;
    durationMin: number;
    studioId: string | null;
    location: string | null;
    isPublic: boolean;
    links: BookingLink[];
    days: number[];
    dayOfWeek: number;
    endsOn: string | null;
    specificDate: string | null;
    /** Filled by the caller with the date the sheet was opened on, so the
     *  delete confirm can offer "just this one". */
    occurrenceDate: string | null;
    classId: string;
  };
  studios: { id: string; seq: number; slug: string | null; name: string; address: string }[];
  customTypes: string[];
} | null> {
  const admin = await currentAdmin();
  if (!admin) return null;
  const db = await getDb();
  const [c] = await db.select().from(schema.classes).where(eq(schema.classes.id, classId));
  if (!c) return null;
  const [owner] = await db
    .select({ kind: schema.users.kind })
    .from(schema.users)
    .where(eq(schema.users.id, c.userId));
  if (!owner || owner.kind === "gym") return null;
  // A weekly class is one row per weekday sharing a series; the editor's
  // day pills need the whole set or a save would drop the days not shown.
  const siblings = c.specificDate
    ? [c]
    : await db
        .select({ dayOfWeek: schema.classes.dayOfWeek })
        .from(schema.classes)
        .where(
          and(
            eq(schema.classes.userId, c.userId),
            eq(schema.classes.seriesId, c.seriesId),
            isNull(schema.classes.specificDate),
          ),
        );
  const [studioRows, typeRows] = await Promise.all([
    db.select().from(schema.studios).orderBy(schema.studios.seq),
    db.select({ name: schema.customClassTypes.name }).from(schema.customClassTypes),
  ]);
  return {
    prefill: {
      name: c.name,
      classType: c.classType,
      description: c.description,
      image: c.image,
      startTime: c.startTime,
      durationMin: c.durationMin,
      studioId: c.studioId,
      location: c.location,
      isPublic: c.isPublic,
      links: c.links ?? [],
      days: [...new Set(siblings.map((s) => s.dayOfWeek))],
      dayOfWeek: c.dayOfWeek,
      endsOn: c.endsOn,
      specificDate: c.specificDate,
      occurrenceDate: null,
      classId: c.id,
    },
    studios: studioRows.map((s) => ({
      id: s.id,
      seq: s.seq,
      slug: s.slug,
      name: s.name,
      address: s.address,
    })),
    customTypes: typeRows.map((r) => r.name),
  };
}

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
  const img = await storeImage(image?.trim() || null, "class");
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

// The same beta-era catalog power as the picture, for the booking door: the
// admin can hand a class a link only where it has none, because a link the
// coach set is their word and stays theirs. Same spread as the photo: every
// same-title class under the owner, and the owner's template, so re-adding
// the class keeps the door. Fill-the-blanks is the whole contract: a row
// that already has links is never touched.
export async function adminSetClassLink(
  classId: string,
  rawUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, error: "Not allowed." };
  const url = rawUrl.trim();
  if (!/^https?:\/\/[^\s]+\.[^\s]+/.test(url))
    return { ok: false, error: "That doesn't look like a link." };
  const db = await getDb();
  const [c] = await db.select().from(schema.classes).where(eq(schema.classes.id, classId));
  if (!c) return { ok: false, error: "That class isn't there any more." };
  const links = [{ label: detectProvider(url), url }];
  await db
    .update(schema.classes)
    .set({ links })
    .where(
      and(
        eq(schema.classes.userId, c.userId),
        sql`lower(${schema.classes.name}) = ${c.name.toLowerCase()}`,
        sql`jsonb_array_length(${schema.classes.links}) = 0`,
      ),
    );
  await db
    .update(schema.classTemplates)
    .set({ links })
    .where(
      and(
        eq(schema.classTemplates.userId, c.userId),
        sql`lower(${schema.classTemplates.name}) = ${c.name.toLowerCase()}`,
        sql`jsonb_array_length(${schema.classTemplates.links}) = 0`,
      ),
    );
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

/** ADMIN — the accounts a query matches, for handing keys by account
 *  rather than by remembered email: name, handle or email, any of them,
 *  because whichever one you know is the one you should get to type. The
 *  gym accounts stay out; a place cannot run a place. */
export async function adminSearchAccounts(qRaw: string): Promise<
  { id: string; name: string; handle: string | null; email: string; photo: string | null }[]
> {
  const admin = await currentAdmin();
  if (!admin) return [];
  const q = qRaw.trim().toLowerCase();
  if (q.length < 2) return [];
  const db = await getDb();
  const rows = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      handle: schema.users.handle,
      email: schema.users.email,
      photo: schema.users.photoThumb,
      photoFull: schema.users.photo,
      kind: schema.users.kind,
    })
    .from(schema.users)
    .where(
      sql`${schema.users.kind} != 'gym' and (lower(${schema.users.name}) like ${"%" + q + "%"} or lower(coalesce(${schema.users.handle}, '')) like ${"%" + q + "%"} or lower(${schema.users.email}) like ${"%" + q + "%"})`,
    )
    .limit(6);
  return rows.map((r) => ({
    id: r.id,
    name: r.name.trim() || r.email.split("@")[0],
    handle: r.handle,
    email: r.email,
    photo: r.photo ?? r.photoFull,
  }));
}

// The keys themselves, shared by both doors below.
async function handKeys(
  studioId: string,
  userId: string,
  adminId: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) return { ok: false, error: "No such account." };
  if (user.kind === "gym") return { ok: false, error: "A place cannot run a place." };
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
    .values({ studioId, userId: user.id, addedByUserId: adminId });
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

/** ADMIN — hand the keys to an account picked from the search above. */
export async function adminAddStudioManagerById(
  studioId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  return handKeys(studioId, userId, admin.id);
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
  return handKeys(studioId, user.id, admin.id);
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
    return { ok: false, error: "Hand the page to somebody first: a schedule needs someone to run it." };

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
  // The edit history, the keys and the shift list go with the studio they
  // describe.
  await db.delete(schema.studioRotaCoaches).where(eq(schema.studioRotaCoaches.studioId, id));
  await db.delete(schema.shiftRequests).where(eq(schema.shiftRequests.studioId, id));
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
  // A roster placeholder is a position a studio is holding open, not a
  // person. Taking it off the roster is what removes it, and that has to go
  // through the rota so the shifts it holds are reopened rather than orphaned.
  if (u.kind === PLACEHOLDER_KIND) {
    return { ok: false, error: "That's a roster placeholder. Remove it from the studio's roster." };
  }

  await purgeUser(db, id);
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
    subject: "You're invited to fittlist",
    intro:
      "You lucky duck. You've been invited to fittlist. Tap to set up your page:",
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
    subject: "You're invited to fittlist",
    intro:
      "You lucky duck. You've been invited to fittlist. Tap to set up your page:",
    invite: true,
  });
  revalidatePath("/admin");
  return { ok: true, url, emailed: true };
}

// A note from fittlist itself, into the Updates feed. One person by handle or
// email, all coaches, all members, or everyone. In-app only: an announcement
// is app news and stays in notification history. No actor,
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
  // The combined Updates badge is in every signed-in header.
  revalidatePath("/", "layout");
  return { ok: true, sent: targets.length };
}
