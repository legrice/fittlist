import { cache } from "react";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";

/** One identity lookup per server render, even when both layout and page need it. */
export const currentUser = cache(async () => {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const db = await getDb();
  // This identity is used by the persistent app shell and a handful of
  // calendar/discover loaders. A full users row also includes the password
  // hash, profile bio, contact details, certifications and the original hero
  // image. Pulling that on every tab response made the most frequently run
  // query one of the heaviest, especially for legacy base64 photos.
  const [user] = await db
    .select({
      id: schema.users.id,
      kind: schema.users.kind,
      email: schema.users.email,
      name: schema.users.name,
      handle: schema.users.handle,
      // Keep legacy accounts visible without sending both image variants.
      // New accounts read only the thumbnail; old rows fall back to photo.
      photo: sql<string | null>`coalesce(${schema.users.photoThumb}, ${schema.users.photo})`.as("photo"),
      photoThumb: schema.users.photoThumb,
      title: schema.users.title,
      location: schema.users.location,
      locationLat: schema.users.locationLat,
      locationLng: schema.users.locationLng,
      look: schema.users.look,
      avatarColor: schema.users.avatarColor,
      storyPrefs: schema.users.storyPrefs,
      createdAt: schema.users.createdAt,
      onboardedAt: schema.users.onboardedAt,
      feedbackPromptedAt: schema.users.feedbackPromptedAt,
      invitesBannerAt: schema.users.invitesBannerAt,
      adminActivityAt: schema.users.adminActivityAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return user ?? null;
});
