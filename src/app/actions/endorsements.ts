"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";

const TRAITS = new Set([
  "great_coaching",
  "welcoming",
  "motivating",
  "clear_cues",
  "form_expert",
  "makes_it_fun",
  "community_builder",
  "high_energy",
  "calming_presence",
  "creative_classes",
  "tough_love",
  "always_prepared",
  "inclusive",
  "great_music",
  "confidence_builder",
  "detail_oriented",
  "adaptable",
  "authentic",
]);

const STUDIO_TRAITS = new Set([
  "welcoming_space",
  "great_community",
  "beautiful_space",
  "great_energy",
  "beginner_friendly",
  "inclusive_space",
  "top_equipment",
  "thoughtful_classes",
  "spotless",
  "hidden_gem",
  "worth_the_trip",
  "great_music",
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function toggleEndorsement(handle: string, trait: string) {
  const viewerId = await getSessionUserId();
  if (!viewerId) return { ok: false, signedOut: true };
  if (!TRAITS.has(trait)) return { ok: false };
  const db = await getDb();
  const [target] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.handle, handle));
  if (!target || target.id === viewerId) return { ok: false };
  const where = and(
    eq(schema.profileEndorsements.targetUserId, target.id),
    eq(schema.profileEndorsements.endorserUserId, viewerId),
    eq(schema.profileEndorsements.trait, trait),
  );
  const [existing] = await db.select({ id: schema.profileEndorsements.id }).from(schema.profileEndorsements).where(where);
  if (existing) await db.delete(schema.profileEndorsements).where(eq(schema.profileEndorsements.id, existing.id));
  else await db.insert(schema.profileEndorsements).values({ targetUserId: target.id, endorserUserId: viewerId, trait });
  revalidatePath(`/${handle}`);
  return { ok: true, selected: !existing };
}

export async function toggleStudioEndorsement(slug: string, trait: string) {
  const viewerId = await getSessionUserId();
  if (!viewerId) return { ok: false, signedOut: true };
  if (!STUDIO_TRAITS.has(trait)) return { ok: false };
  const db = await getDb();
  const [target] = await db
    .select({ id: schema.studios.id, slug: schema.studios.slug })
    .from(schema.studios)
    .where(UUID_RE.test(slug) ? eq(schema.studios.id, slug) : eq(schema.studios.slug, slug));
  if (!target) return { ok: false };
  const where = and(
    eq(schema.studioEndorsements.targetStudioId, target.id),
    eq(schema.studioEndorsements.endorserUserId, viewerId),
    eq(schema.studioEndorsements.trait, trait),
  );
  const [existing] = await db.select({ id: schema.studioEndorsements.id }).from(schema.studioEndorsements).where(where);
  if (existing) await db.delete(schema.studioEndorsements).where(eq(schema.studioEndorsements.id, existing.id));
  else await db.insert(schema.studioEndorsements).values({ targetStudioId: target.id, endorserUserId: viewerId, trait });
  revalidatePath(`/s/${slug}`);
  return { ok: true, selected: !existing };
}
