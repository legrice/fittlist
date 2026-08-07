"use server";

import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { geocodeAddress } from "@/lib/geocode";
import { storeImage } from "@/lib/storage";
import { currentAdmin, adminEmails } from "@/lib/admin";
import { addNotification } from "@/lib/notify";
import { getSessionUserId } from "@/lib/session";
import { STUDIO_TYPES } from "@/lib/studio";
import { studioAccess } from "@/lib/studioaccess";

export type StudioDto = { id: string; seq: number; name: string; address: string };

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
): Promise<{ ok: boolean; studio?: StudioDto; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const name = nameRaw.trim();
  const address = addressRaw.trim();
  if (!name) return { ok: false, error: "Enter the studio name." };
  if (!address) return { ok: false, error: "Enter the address." };
  const db = await getDb();
  // A studio is a place, and a place has a point: one lookup at save,
  // best-effort, null on a miss.
  const geo = await geocodeAddress(address);
  const [studio] = await db
    .insert(schema.studios)
    .values({
      name,
      address,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      slug: await uniqueSlug(name),
      createdByUserId: userId,
    })
    .returning();
  return {
    ok: true,
    studio: { id: studio.id, seq: studio.seq, name: studio.name, address: studio.address },
  };
}

export type StudioEdit = {
  name: string;
  address: string;
  types: string[];
  about: string;
  photo?: string | null; // data URL, "" to clear, undefined to leave as-is
  contactEmail: string;
  phone: string;
  website: string;
  instagram: string;
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
  if (!name) return { ok: false, error: "Enter the studio name." };
  if (!address) return { ok: false, error: "Enter the address." };
  if (
    input.photo &&
    !/^https:\/\//.test(input.photo) &&
    (!input.photo.startsWith("data:image/") || input.photo.length > 900_000)
  )
    return { ok: false, error: "That image didn't work. Try a smaller one." };

  const [existing] = await db.select().from(schema.studios).where(eq(schema.studios.id, id));
  if (!existing) return { ok: false, error: "Studio not found." };

  // Only recompute the slug when the name actually moved, so a link to a studio
  // survives unrelated edits. Same rule for the point: the address moving is
  // what makes the old coordinates wrong.
  const slug =
    existing.slug && existing.name.trim() === name ? existing.slug : await uniqueSlug(name, id);
  const geo = existing.address.trim() === address ? null : await geocodeAddress(address);

  const types = input.types.filter((t) => (STUDIO_TYPES as readonly string[]).includes(t));
  const set: Partial<typeof schema.studios.$inferInsert> = {
    ...(geo ? { lat: geo.lat, lng: geo.lng } : {}),
    name,
    address,
    slug,
    types,
    about: input.about.trim() || null,
    contactEmail: input.contactEmail.trim() || null,
    phone: input.phone.trim() || null,
    website: input.website.trim() || null,
    instagram: input.instagram.trim().replace(/^@/, "") || null,
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
    input.photo === undefined || (existing.photo ?? "") === (set.photo ?? "")
      ? null
      : !existing.photo
        ? "photo added"
        : !set.photo
          ? "photo removed"
          : "photo replaced",
  ].filter((c): c is string => !!c);
  if (changes.length) {
    await db.insert(schema.studioEdits).values({ studioId: id, editorUserId: userId, changes });
  }

  await db.update(schema.studios).set(set).where(eq(schema.studios.id, id));
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
    .map((s) => ({ id: s.id, seq: s.seq, name: s.name, address: s.address }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Every studio in the directory, for the picker. Beta-sized on purpose. */
export async function listAllStudios(): Promise<StudioDto[]> {
  const db = await getDb();
  const rows = await db.select().from(schema.studios).orderBy(asc(schema.studios.name));
  return rows.map((s) => ({ id: s.id, seq: s.seq, name: s.name, address: s.address }));
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
  const db = await getDb();
  const [studio] = await db.select().from(schema.studios).where(eq(schema.studios.id, studioId));
  if (!studio) return { ok: false, error: "Studio not found." };
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
