"use server";

import { and, eq, or, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { storeImage } from "@/lib/storage";

async function ownedProfile(studioId?: string, groupId?: string) {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const db = await getDb();
  if (groupId !== undefined) {
    if (studioId !== undefined || typeof groupId !== "string" || !/^[0-9a-f-]{36}$/i.test(groupId)) return null;
    const [group] = await db.select({ id: schema.groups.id, slug: schema.groups.slug, banner: schema.groups.bannerPhoto }).from(schema.groups)
      .leftJoin(schema.groupMembers, and(eq(schema.groupMembers.groupId, schema.groups.id), eq(schema.groupMembers.userId, userId)))
      .where(and(eq(schema.groups.id, groupId), or(eq(schema.groups.ownerUserId, userId), inArray(schema.groupMembers.role, ["owner", "admin"]))));
    return group ? { id: group.id, banner: group.banner, path: `/g/${group.slug}`, studio: false, group: true } : null;
  }
  if (studioId !== undefined) {
    if (typeof studioId !== "string" || !/^[0-9a-f-]{36}$/i.test(studioId)) return null;
    const [studio] = await db.select({ id: schema.studios.id, slug: schema.studios.slug, banner: schema.studios.bannerPhoto })
      .from(schema.studios).innerJoin(schema.studioManagers, eq(schema.studioManagers.studioId, schema.studios.id))
      .where(and(eq(schema.studios.id, studioId), eq(schema.studioManagers.userId, userId)));
    return studio ? { id: studio.id, banner: studio.banner, path: `/s/${studio.slug ?? studio.id}`, studio: true } : null;
  }
  const [user] = await db.select({ id: schema.users.id, handle: schema.users.handle, banner: schema.users.bannerPhoto })
    .from(schema.users).where(eq(schema.users.id, userId));
  return user ? { id: user.id, banner: user.banner, path: user.handle ? `/${user.handle}` : "/calendar", studio: false } : null;
}

export async function loadProfileBanner(studioId?: string, groupId?: string) {
  const profile = await ownedProfile(studioId, groupId);
  return profile ? { banner: profile.banner } : null;
}

export async function saveProfileBanner(image: string | null, studioId?: string, groupId?: string): Promise<{ ok: boolean; error?: string }> {
  const profile = await ownedProfile(studioId, groupId);
  if (!profile) return { ok: false, error: "Only this profile’s owner can change its banner." };
  let banner: string | null = null;
  if (image !== null) {
    if (typeof image !== "string" || image.length > 2_500_000 || !/^data:image\/(jpeg|png|webp);base64,/.test(image))
      return { ok: false, error: "Choose a JPG, PNG, or WebP image under 2.5 MB." };
    try {
      const bytes = Buffer.from(image.slice(image.indexOf(",") + 1), "base64");
      const resized = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().resize(1600, 500, { fit: "cover" }).jpeg({ quality: 85 }).toBuffer();
      banner = await storeImage(`data:image/jpeg;base64,${resized.toString("base64")}`, "group" in profile ? "group" : profile.studio ? "studio" : "u");
    } catch {
      return { ok: false, error: "That image couldn’t be read. Try another photo." };
    }
  }
  const db = await getDb();
  if ("group" in profile) await db.update(schema.groups).set({ bannerPhoto: banner }).where(eq(schema.groups.id, profile.id));
  else if (profile.studio) await db.update(schema.studios).set({ bannerPhoto: banner }).where(eq(schema.studios.id, profile.id));
  else await db.update(schema.users).set({ bannerPhoto: banner }).where(eq(schema.users.id, profile.id));
  revalidatePath(profile.path, "layout");
  revalidatePath("/calendar");
  return { ok: true };
}
