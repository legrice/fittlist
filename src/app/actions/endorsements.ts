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
