"use server";

import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getDb, schema } from "@/db";
import { geocodeAddress, timeZoneAtCoordinates } from "@/lib/geocode";
import { storeImage } from "@/lib/storage";
import { currentAdmin, adminEmails } from "@/lib/admin";
import { addNotification } from "@/lib/notify";
import { objectionableContentError } from "@/lib/content-safety";
import { getSessionUserId } from "@/lib/session";
import { PLACE_KINDS, STUDIO_TYPES, type PlaceKind } from "@/lib/studio";
import { studioAccess } from "@/lib/studioaccess";
import { isValidTimeZone } from "@/lib/timezone";
import { syncUserToGoogle } from "@/lib/gcal";
import {
  ANONYMOUS_ACTION_RETRY_ERROR,
  takeAnonymousActionRateLimit,
  type AnonymousActionRateLimits,
} from "@/lib/anonymous-rate-limit";
import { requestIpAddress } from "@/lib/request-ip";

export type StudioDto = {
  id: string;
  seq: number;
  slug?: string | null;
  name: string;
  address: string;
  timeZone?: string;
};

export type StudioMatch = Required<Pick<StudioDto, "id" | "seq" | "name" | "address">> & {
  slug: string | null;
};

// Names in a shared directory need a comparison form that ignores the tiny
// differences people naturally type on a phone (spaces, punctuation and &).
const studioKey = (value: string) =>
  value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");

const duplicatePlace = (
  row: typeof schema.studios.$inferSelect,
  name: string,
  address: string,
  placeKind: PlaceKind,
) => {
  if (row.placeKind !== placeKind || studioKey(row.name) !== studioKey(name)) return false;
  // A virtual destination has no street identity, so its name is its stable
  // directory identity. Physical places and pop-ups may legitimately share a
  // name across locations; only the same name at the same location is a copy.
  return placeKind === "virtual" || studioKey(row.address) === studioKey(address);
};

const studioMatch = (row: typeof schema.studios.$inferSelect): StudioMatch => ({
  id: row.id,
  seq: row.seq,
  slug: row.slug,
  name: row.name,
  address: row.address,
});

/** Lightweight typeahead for every place-creation door. */
export async function findStudioMatches(
  queryRaw: string,
  kindRaw: PlaceKind = "studio",
): Promise<StudioMatch[]> {
  const userId = await getSessionUserId();
  const query = queryRaw.trim();
  if (!userId || query.length < 2) return [];
  const placeKind = PLACE_KINDS.includes(kindRaw) ? kindRaw : "studio";
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.studios)
    .where(eq(schema.studios.placeKind, placeKind))
    .orderBy(asc(schema.studios.name));
  const needle = studioKey(query);
  return rows
    .filter((row) => studioKey(row.name).includes(needle))
    .slice(0, 5)
    .map(studioMatch);
}

export type StudioCreateDetails = {
  types?: string[];
  about?: string;
  photo?: string | null;
  contactEmail?: string;
  phone?: string;
  website?: string;
  instagram?: string;
  timeZone?: string;
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

// The name decides the slug; a collision picks up a numeric suffix rather than
// failing the save, so two studios called Reform never block each other.
async function uniqueSlug(name: string, exceptId?: string) {
  const db = await getDb();
  const base = slugify(name) || "studio";
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const rows = await db
      .select({ id: schema.studios.id })
      .from(schema.studios)
      .where(
        exceptId
          ? and(eq(schema.studios.slug, candidate), ne(schema.studios.id, exceptId))
          : eq(schema.studios.slug, candidate),
      );
    if (!rows.length) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function createStudio(
  nameRaw: string,
  addressRaw: string,
  kindRaw: PlaceKind = "studio",
  details: StudioCreateDetails = {},
): Promise<{ ok: boolean; studio?: StudioDto; duplicate?: StudioMatch; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const name = nameRaw.trim();
  const address = addressRaw.trim();
  if (!name) return { ok: false, error: "Enter the place name." };
  const safetyError = objectionableContentError(name, address, details.about);
  if (safetyError) return { ok: false, error: safetyError };
  const placeKind = PLACE_KINDS.includes(kindRaw) ? kindRaw : "studio";
  if (placeKind !== "virtual" && !address) return { ok: false, error: "Enter the location." };
  if (
    details.photo &&
    !/^https:\/\//.test(details.photo) &&
    (!details.photo.startsWith("data:image/") || details.photo.length > 2_500_000)
  )
    return { ok: false, error: "That photo couldn't be prepared. Try another photo." };
  const db = await getDb();
  // Autocomplete is guidance; this is the actual guard. Keeping it here means
  // the global composer, class adder and profile settings cannot bypass it.
  const existing = await db.select().from(schema.studios).orderBy(asc(schema.studios.name));
  const duplicate = existing.find((row) => duplicatePlace(row, name, address, placeKind));
  if (duplicate) {
    return {
      ok: false,
      duplicate: studioMatch(duplicate),
      error: `${duplicate.name} is already on FittList.`,
    };
  }
  // A studio is a place, and a place has a point: one lookup at save,
  // best-effort, null on a miss.
  const geo = placeKind === "virtual" ? null : await geocodeAddress(address);
  const detectedTimeZone = geo
    ? await timeZoneAtCoordinates(geo.lat, geo.lng)
    : null;
  const types = (details.types ?? []).filter((type) =>
    (STUDIO_TYPES as readonly string[]).includes(type),
  );
  const photo = details.photo
    ? await storeImage(details.photo, "studio")
    : null;
  const [studio] = await db
    .insert(schema.studios)
    .values({
      name,
      address,
      placeKind,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      ...(isValidTimeZone(details.timeZone ?? detectedTimeZone)
        ? { timeZone: (details.timeZone ?? detectedTimeZone)! }
        : {}),
      slug: await uniqueSlug(name),
      createdByUserId: userId,
      types,
      about: details.about?.trim() || null,
      photo,
      contactEmail: details.contactEmail?.trim() || null,
      phone: details.phone?.trim() || null,
      website: details.website?.trim() || null,
      instagram: details.instagram?.trim().replace(/^@/, "") || null,
    })
    .returning();
  return {
    ok: true,
    studio: {
      id: studio.id,
      seq: studio.seq,
      slug: studio.slug,
      name: studio.name,
      address: studio.address,
      timeZone: studio.timeZone,
    },
  };
}

export type StudioEdit = {
  name: string;
  address: string;
  placeKind: PlaceKind;
  types: string[];
  about: string;
  photo?: string | null; // data URL, "" to clear, undefined to leave as-is
  contactEmail: string;
  phone: string;
  website: string;
  instagram: string;
  timeZone: string;
};

// Studios are a shared directory: any coach can add one from the adder, and any
// coach can correct one. That's deliberate for the beta — a studio nobody owns
// beats a studio with a wrong address nobody can fix — but it means edits run
// on trust. Claiming, with a real owner, is the next step.
export async function updateStudio(
  id: string,
  input: StudioEdit,
): Promise<{ ok: boolean; error?: string; slug?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const db = await getDb();
  // A coach is kind, never handle: members claim handles too, and the
  // handle test quietly held this door open to everyone.
  const [me] = await db
    .select({ kind: schema.users.kind })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me || me.kind === "fan") return { ok: false, error: "Only coaches can edit a studio." };

  // Claimed means the gym states its own details. The door isn't closed, it
  // moved: Suggest an edit goes to the people who can actually answer.
  const access = await studioAccess(id, { id: userId, kind: me.kind });
  if (!access.canEdit)
    return {
      ok: false,
      error: "This studio keeps its own page. Use Suggest an edit and they'll see it.",
    };

  const name = input.name.trim();
  const address = input.address.trim();
  const placeKind = PLACE_KINDS.includes(input.placeKind) ? input.placeKind : "studio";
  if (!name) return { ok: false, error: "Enter the studio name." };
  const safetyError = objectionableContentError(name, address, input.about);
  if (safetyError) return { ok: false, error: safetyError };
  if (placeKind !== "virtual" && !address) return { ok: false, error: "Enter the location." };
  if (
    input.photo &&
    !/^https:\/\//.test(input.photo) &&
    (!input.photo.startsWith("data:image/") || input.photo.length > 2_500_000)
  )
    return { ok: false, error: "That photo couldn't be prepared. Try another photo." };

  const [existing] = await db.select().from(schema.studios).where(eq(schema.studios.id, id));
  if (!existing) return { ok: false, error: "Studio not found." };
  const possibleDuplicates = await db.select().from(schema.studios).where(
    and(eq(schema.studios.placeKind, placeKind), ne(schema.studios.id, id)),
  );
  const duplicate = possibleDuplicates.find((row) => duplicatePlace(row, name, address, placeKind));
  if (duplicate) return { ok: false, error: `${duplicate.name} is already on FittList.` };

  // Only recompute the slug when the name actually moved, so a link to a studio
  // survives unrelated edits. Same rule for the point: the address moving is
  // what makes the old coordinates wrong.
  const slug =
    existing.slug && existing.name.trim() === name ? existing.slug : await uniqueSlug(name, id);
  const geo =
    placeKind === "virtual" || existing.address.trim() === address
      ? null
      : await geocodeAddress(address);
  const detectedTimeZone = geo
    ? await timeZoneAtCoordinates(geo.lat, geo.lng)
    : null;
  const timeZone = isValidTimeZone(input.timeZone)
    ? input.timeZone
    : isValidTimeZone(detectedTimeZone)
      ? detectedTimeZone
      : existing.timeZone;

  const types = input.types.filter((t) => (STUDIO_TYPES as readonly string[]).includes(t));
  const set: Partial<typeof schema.studios.$inferInsert> = {
    ...(geo ? { lat: geo.lat, lng: geo.lng } : {}),
    name,
    address,
    placeKind,
    ...(placeKind === "virtual" ? { lat: null, lng: null } : {}),
    slug,
    types,
    about: input.about.trim() || null,
    contactEmail: input.contactEmail.trim() || null,
    phone: input.phone.trim() || null,
    website: input.website.trim() || null,
    instagram: input.instagram.trim().replace(/^@/, "") || null,
    timeZone,
  };
  if (input.photo !== undefined) set.photo = (await storeImage(input.photo || null, "studio")) || null;

  // The receipt. Anyone with the button can edit, so every save that changed
  // something writes who did what, in plain words the admin can read straight
  // off the card. Long values get clipped; the photo is named, never inlined.
  const clip = (v: string) => (v.length > 60 ? v.slice(0, 60) + "…" : v);
  const line = (label: string, from: string | null, to: string | null): string | null => {
    const a = (from ?? "").trim();
    const b = (to ?? "").trim();
    if (a === b) return null;
    if (!a) return `${label} added: "${clip(b)}"`;
    if (!b) return `${label} removed (was "${clip(a)}")`;
    return `${label}: "${clip(a)}" to "${clip(b)}"`;
  };
  const changes = [
    line("name", existing.name, name),
    line("address", existing.address, address),
    line("types", existing.types.join(", "), types.join(", ")),
    line("about", existing.about, set.about ?? null),
    line("email", existing.contactEmail, set.contactEmail ?? null),
    line("phone", existing.phone, set.phone ?? null),
    line("website", existing.website, set.website ?? null),
    line("instagram", existing.instagram, set.instagram ?? null),
    line("time zone", existing.timeZone, timeZone),
    input.photo === undefined || (existing.photo ?? "") === (set.photo ?? "")
      ? null
      : !existing.photo
        ? "photo added"
        : !set.photo
          ? "photo removed"
          : "photo replaced",
  ].filter((c): c is string => !!c);
  const affectedOwners = existing.timeZone === timeZone
    ? []
    : await db
        .select({ userId: schema.classes.userId })
        .from(schema.classes)
        .where(eq(schema.classes.studioId, id));
  await db.transaction(async (tx) => {
    if (changes.length) {
      await tx.insert(schema.studioEdits).values({ studioId: id, editorUserId: userId, changes });
    }
    await tx.update(schema.studios).set(set).where(eq(schema.studios.id, id));
    if (existing.timeZone !== timeZone) {
      await tx.update(schema.classes).set({ timeZone }).where(eq(schema.classes.studioId, id));
      await tx.update(schema.classTemplates).set({ timeZone }).where(eq(schema.classTemplates.studioId, id));
      await tx.update(schema.personalClasses).set({ timeZone }).where(eq(schema.personalClasses.studioId, id));
    }
  });
  if (affectedOwners.length) {
    const ownerIds = [...new Set(affectedOwners.map((row) => row.userId))];
    after(() => Promise.all(ownerIds.map((ownerId) =>
      syncUserToGoogle(ownerId).catch((error) => console.error("gcal studio timezone sync failed", error)),
    )));
  }
  revalidatePath(`/s/${slug}`);
  if (existing.slug && existing.slug !== slug) revalidatePath(`/s/${existing.slug}`);
  revalidatePath("/admin");
  return { ok: true, slug };
}

/** Whether the studio's public schedule names who is coaching each class.
 *  A manager's call (the same door updateStudio guards), on by default. */
export async function setStudioShowCoaches(
  id: string,
  on: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const db = await getDb();
  const [me] = await db
    .select({ kind: schema.users.kind })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me || me.kind === "fan") return { ok: false, error: "Only coaches can edit a studio." };
  const access = await studioAccess(id, { id: userId, kind: me.kind });
  // Stricter than editing on purpose: an unclaimed page has no rota and no
  // schedule of its own, so only the people who run the place hold this.
  if (!access.claimed || !access.canEdit)
    return { ok: false, error: "Only the studio's managers can change this." };
  const [st] = await db.select().from(schema.studios).where(eq(schema.studios.id, id));
  if (!st) return { ok: false, error: "Studio not found." };
  await db.update(schema.studios).set({ showCoaches: on }).where(eq(schema.studios.id, id));
  if (st.slug) revalidatePath(`/s/${st.slug}`);
  return { ok: true };
}

// ---- Places I coach. The picks live in coach_studios; the profile shows the
// union of these and anywhere they have a class, so removing a pick never
// hides a studio they actually teach at.

export async function myCoachStudios(): Promise<StudioDto[]> {
  const userId = await getSessionUserId();
  if (!userId) return [];
  const db = await getDb();
  const picks = await db
    .select({ studioId: schema.coachStudios.studioId })
    .from(schema.coachStudios)
    .where(eq(schema.coachStudios.userId, userId));
  if (!picks.length) return [];
  const rows = await db
    .select()
    .from(schema.studios)
    .where(inArray(schema.studios.id, picks.map((p) => p.studioId)));
  return rows
    .map((s) => ({ id: s.id, seq: s.seq, slug: s.slug, name: s.name, address: s.address }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Every studio in the directory, for the picker. Beta-sized on purpose. */
export async function listAllStudios(): Promise<StudioDto[]> {
  const db = await getDb();
  const rows = await db.select().from(schema.studios).orderBy(asc(schema.studios.name));
  return rows.map((s) => ({ id: s.id, seq: s.seq, slug: s.slug, name: s.name, address: s.address }));
}

export async function addCoachStudio(studioId: string): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const db = await getDb();
  const [studio] = await db.select().from(schema.studios).where(eq(schema.studios.id, studioId));
  if (!studio) return { ok: false, error: "Studio not found." };
  await db
    .insert(schema.coachStudios)
    .values({ userId, studioId })
    .onConflictDoNothing();
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeCoachStudio(studioId: string): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };
  const db = await getDb();
  await db
    .delete(schema.coachStudios)
    .where(and(eq(schema.coachStudios.userId, userId), eq(schema.coachStudios.studioId, studioId)));
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---- Reports and suggested edits.

const STUDIO_SUGGESTION_LIMITS: AnonymousActionRateLimits = {
  ip: { max: 12, windowMs: 60 * 60 * 1000 },
  ipTarget: { max: 5, windowMs: 60 * 60 * 1000 },
  subjectTarget: { max: 3, windowMs: 60 * 60 * 1000 },
  target: { max: 30, windowMs: 60 * 60 * 1000 },
};

/** A signed-in person says a studio isn't right. One report per person per studio. */
export async function reportStudio(
  studioId: string,
  reasonRaw: string,
  noteRaw = "",
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const reason = reasonRaw.trim().slice(0, 60);
  const note = noteRaw.trim().slice(0, 300);
  if (!reason) return { ok: false, error: "Pick a reason." };
  const db = await getDb();
  const [studio] = await db.select().from(schema.studios).where(eq(schema.studios.id, studioId));
  if (!studio) return { ok: false, error: "Studio not found." };
  await db
    .insert(schema.studioReports)
    .values({ studioId, reporterUserId: userId, reason, note })
    .onConflictDoNothing({
      target: [schema.studioReports.studioId, schema.studioReports.reporterUserId],
    });
  revalidatePath("/admin");
  return { ok: true };
}

/** Anyone, signed in or not, suggesting a correction, or an owner raising a
 *  hand. Lands with the admin; the relation field is what makes it a lead. */
export async function suggestStudioEdit(
  studioId: string,
  nameRaw: string,
  emailRaw: string,
  relationRaw: string,
  messageRaw: string,
): Promise<{ ok: boolean; error?: string }> {
  const email = emailRaw.trim().toLowerCase();
  const name = nameRaw.trim().slice(0, 80);
  const relation = relationRaw.trim().slice(0, 60);
  const message = messageRaw.trim().slice(0, 1000);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email." };
  if (message.length < 2) return { ok: false, error: "Write what should change." };
  const safetyError = objectionableContentError(name, relation, message);
  if (safetyError) return { ok: false, error: safetyError };
  const db = await getDb();
  const [studio] = await db.select().from(schema.studios).where(eq(schema.studios.id, studioId));
  if (!studio) return { ok: false, error: "Studio not found." };
  let allowed = false;
  try {
    allowed = await takeAnonymousActionRateLimit(db, {
      action: "studio_suggestion",
      target: { kind: "studio", id: studio.id },
      subject: email,
      ip: await requestIpAddress(),
      limits: STUDIO_SUGGESTION_LIMITS,
    });
  } catch (error) {
    console.error("studio suggestion rate limit failed", error);
  }
  if (!allowed) return { ok: false, error: ANONYMOUS_ACTION_RETRY_ERROR };
  await db.insert(schema.studioSuggestions).values({ studioId, name, email, relation, message });
  // Tell whoever runs the place. Best effort, and quiet on failure.
  try {
    const admins = adminEmails();
    if (admins.length) {
      const [host] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(inArray(schema.users.email, admins));
      if (host) {
        await addNotification(host.id, {
          type: "studio_suggest",
          title: `Edit suggested for ${studio.name}`,
          body: `${name || email}${relation ? ` (${relation.toLowerCase()})` : ""}: ${message}`,
          href: "/admin",
        });
      }
    }
  } catch (err) {
    console.error("studio suggestion notification failed", err);
  }
  revalidatePath("/admin");
  return { ok: true };
}

export type ReportedStudio = {
  studioId: string;
  studioName: string;
  studioHref: string;
  count: number;
  reasons: string[];
  notes: string[];
  reporters: string[];
  latestAt: string;
};

export type StudioSuggestion = {
  id: string;
  studioId: string;
  studioName: string;
  studioHref: string;
  name: string;
  email: string;
  relation: string;
  message: string;
  at: string;
};

/** ADMIN — reported studios, most-reported first. */
export async function listStudioReports(): Promise<ReportedStudio[]> {
  if (!(await currentAdmin())) return [];
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.studioReports)
    .orderBy(desc(schema.studioReports.createdAt));
  if (!rows.length) return [];
  const studioIds = [...new Set(rows.map((r) => r.studioId))];
  const reporterIds = [...new Set(rows.map((r) => r.reporterUserId))];
  const [studios, reporters] = await Promise.all([
    db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds)),
    db.select().from(schema.users).where(inArray(schema.users.id, reporterIds)),
  ]);
  const studioById = new Map(studios.map((s) => [s.id, s]));
  const nameById = new Map(reporters.map((u) => [u.id, u.name.trim() || u.email]));
  const grouped = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = grouped.get(r.studioId) ?? [];
    list.push(r);
    grouped.set(r.studioId, list);
  }
  return [...grouped.entries()]
    .map(([studioId, list]) => {
      const s = studioById.get(studioId);
      return {
        studioId,
        studioName: s?.name ?? "A deleted studio",
        studioHref: s ? `/s/${s.slug ?? s.id}` : "",
        count: list.length,
        reasons: [...new Set(list.map((r) => r.reason))],
        notes: list.map((r) => r.note).filter(Boolean),
        reporters: list.map((r) => nameById.get(r.reporterUserId) ?? "someone"),
        latestAt: list[0].createdAt.toISOString(),
      };
    })
    .sort((a, b) => b.count - a.count || b.latestAt.localeCompare(a.latestAt));
}

/** ADMIN — suggested edits, newest first. */
export async function listStudioSuggestions(): Promise<StudioSuggestion[]> {
  if (!(await currentAdmin())) return [];
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.studioSuggestions)
    .orderBy(desc(schema.studioSuggestions.createdAt));
  if (!rows.length) return [];
  const studios = await db
    .select()
    .from(schema.studios)
    .where(inArray(schema.studios.id, [...new Set(rows.map((r) => r.studioId))]));
  const studioById = new Map(studios.map((s) => [s.id, s]));
  return rows.map((r) => {
    const s = studioById.get(r.studioId);
    return {
      id: r.id,
      studioId: r.studioId,
      studioName: s?.name ?? "A deleted studio",
      studioHref: s ? `/s/${s.slug ?? s.id}` : "",
      name: r.name,
      email: r.email,
      relation: r.relation,
      message: r.message,
      at: r.createdAt.toISOString(),
    };
  });
}

/** ADMIN — clear a studio's reports once handled. */
export async function dismissStudioReports(studioId: string): Promise<{ ok: boolean }> {
  if (!(await currentAdmin())) return { ok: false };
  const db = await getDb();
  await db.delete(schema.studioReports).where(eq(schema.studioReports.studioId, studioId));
  revalidatePath("/admin");
  return { ok: true };
}

/** ADMIN — a suggestion answered or noted; off the list. */
export async function dismissStudioSuggestion(id: string): Promise<{ ok: boolean }> {
  if (!(await currentAdmin())) return { ok: false };
  const db = await getDb();
  await db.delete(schema.studioSuggestions).where(eq(schema.studioSuggestions.id, id));
  revalidatePath("/admin");
  return { ok: true };
}
