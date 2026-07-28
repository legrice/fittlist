"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { STUDIO_TYPES } from "@/lib/studio";

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
  const [studio] = await db
    .insert(schema.studios)
    .values({ name, address, slug: await uniqueSlug(name), createdByUserId: userId })
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
  const [me] = await db
    .select({ handle: schema.users.handle })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me?.handle) return { ok: false, error: "Only coaches can edit a studio." };

  const name = input.name.trim();
  const address = input.address.trim();
  if (!name) return { ok: false, error: "Enter the studio name." };
  if (!address) return { ok: false, error: "Enter the address." };
  if (input.photo && (!input.photo.startsWith("data:image/") || input.photo.length > 900_000))
    return { ok: false, error: "That image didn't work. Try a smaller one." };

  const [existing] = await db.select().from(schema.studios).where(eq(schema.studios.id, id));
  if (!existing) return { ok: false, error: "Studio not found." };

  // Only recompute the slug when the name actually moved, so a link to a studio
  // survives unrelated edits.
  const slug =
    existing.slug && existing.name.trim() === name ? existing.slug : await uniqueSlug(name, id);

  const types = input.types.filter((t) => (STUDIO_TYPES as readonly string[]).includes(t));
  const set: Partial<typeof schema.studios.$inferInsert> = {
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
  if (input.photo !== undefined) set.photo = input.photo || null;

  await db.update(schema.studios).set(set).where(eq(schema.studios.id, id));
  revalidatePath(`/s/${slug}`);
  if (existing.slug && existing.slug !== slug) revalidatePath(`/s/${existing.slug}`);
  revalidatePath("/admin");
  return { ok: true, slug };
}
