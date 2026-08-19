"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { addNotification } from "@/lib/notify";

const TRAIT_LABELS: Record<string, string> = {
  great_coaching: "Coach's choice",
  welcoming: "Welcoming energy",
  motivating: "Strong motivator",
  clear_cues: "Clear communicator",
  form_expert: "Form expert",
  makes_it_fun: "Makes it fun",
  community_builder: "Community builder",
  high_energy: "High energy",
  calming_presence: "Calming presence",
  creative_classes: "Creative classes",
  tough_love: "The right push",
  always_prepared: "Always prepared",
  inclusive: "Everyone belongs",
  great_music: "Great music",
  confidence_builder: "Builds confidence",
  detail_oriented: "Notices the details",
  adaptable: "Meets you there",
  authentic: "Authentically them",
};
const TRAITS = new Set(Object.keys(TRAIT_LABELS));

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
  if (existing) {
    await db.delete(schema.profileEndorsements).where(eq(schema.profileEndorsements.id, existing.id));
  } else {
    await db.insert(schema.profileEndorsements).values({ targetUserId: target.id, endorserUserId: viewerId, trait });
    // A badge is social proof somebody gave deliberately, so it belongs in
    // the same unread activity stream as a follow. Notification delivery is
    // best-effort: awarding the badge must still succeed if the feed hiccups.
    try {
      await addNotification(target.id, {
        type: "badge_received",
        title: "You received a badge",
        body: TRAIT_LABELS[trait],
        href: `/${handle}#badges`,
        actorUserId: viewerId,
      });
    } catch (err) {
      console.error("badge notification failed", err);
    }
  }
  revalidatePath(`/${handle}`);
  return { ok: true, selected: !existing };
}

export async function toggleStudioEndorsement(slug: string, trait: string) {
  const viewerId = await getSessionUserId();
  if (!viewerId) return { ok: false, signedOut: true };
  if (!STUDIO_TRAITS.has(trait)) return { ok: false };
  const db = await getDb();
  const [target] = await db
    .select({ id: schema.studios.id, slug: schema.studios.slug, placeKind: schema.studios.placeKind })
    .from(schema.studios)
    .where(UUID_RE.test(slug) ? eq(schema.studios.id, slug) : eq(schema.studios.slug, slug));
  if (!target) return { ok: false };
  // Place badges belong to lasting brick-and-mortar fitness and wellness
  // businesses, not event venues, parks or virtual rooms.
  if (target.placeKind !== "studio" && target.placeKind !== "wellness") return { ok: false };
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

/** A lightweight relationship with a place, distinct from endorsing one of
 * its qualities. The same unique person/place/trait storage gives us a clean
 * toggle without creating a second parallel interaction system. */
export async function toggleStudioVisit(slug: string) {
  const viewerId = await getSessionUserId();
  if (!viewerId) return { ok: false, signedOut: true };
  const db = await getDb();
  const [target] = await db
    .select({ id: schema.studios.id, slug: schema.studios.slug })
    .from(schema.studios)
    .where(UUID_RE.test(slug) ? eq(schema.studios.id, slug) : eq(schema.studios.slug, slug));
  if (!target) return { ok: false };
  const where = and(
    eq(schema.studioEndorsements.targetStudioId, target.id),
    eq(schema.studioEndorsements.endorserUserId, viewerId),
    eq(schema.studioEndorsements.trait, "been_here"),
  );
  const [existing] = await db
    .select({ id: schema.studioEndorsements.id })
    .from(schema.studioEndorsements)
    .where(where);
  if (existing) {
    await db.delete(schema.studioEndorsements).where(eq(schema.studioEndorsements.id, existing.id));
  } else {
    await db.insert(schema.studioEndorsements).values({
      targetStudioId: target.id,
      endorserUserId: viewerId,
      trait: "been_here",
    });
  }
  revalidatePath(`/s/${target.slug ?? slug}`);
  const { recordProductActivity } = await import("@/lib/product-activity");
  await recordProductActivity(viewerId, existing ? "favorite_studio_removed" : "favorite_studio_added");
  return { ok: true, selected: !existing };
}
