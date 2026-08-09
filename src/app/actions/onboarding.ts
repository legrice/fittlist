"use server";

import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { avatarColor } from "@/lib/avatar";
import { distanceKm } from "@/lib/geocode";

// Replace the coach's "I work here" studio set with the given ids (validated
// against the shared directory). Used by the setup wizard's studios step.
export async function setCoachStudios(
  studioIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const ids = [...new Set(studioIds.filter(Boolean))].slice(0, 60);
  const db = await getDb();
  const valid = ids.length
    ? (
        await db
          .select({ id: schema.studios.id })
          .from(schema.studios)
          .where(inArray(schema.studios.id, ids))
      ).map((r) => r.id)
    : [];

  await db.delete(schema.coachStudios).where(eq(schema.coachStudios.userId, userId));
  if (valid.length) {
    await db.insert(schema.coachStudios).values(valid.map((studioId) => ({ userId, studioId })));
  }

  const [u] = await db
    .select({ handle: schema.users.handle })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  revalidatePath("/app");
  if (u?.handle) revalidatePath(`/${u.handle}`);
  return { ok: true };
}

// Mark the setup wizard done, so the app stops redirecting into /welcome.
export async function completeOnboarding(): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };
  const db = await getDb();
  await db
    .update(schema.users)
    .set({ onboardedAt: new Date() })
    .where(eq(schema.users.id, userId));
  return { ok: true };
}

/** The wizard's follow step: a handful of coaches worth following, nearest
 *  first when the new account picked a real place on the page before.
 *  Real pages only, never the person themselves, never a gym account.
 *  Coaches without coordinates rank after the near ones (photos first),
 *  because an unranked page beats an absent one. */
export async function suggestedCoaches(
  near: { lat: number; lng: number } | null,
): Promise<
  { id: string; handle: string; name: string; photo: string | null; color: string; sub: string }[]
> {
  const userId = await getSessionUserId();
  if (!userId) return [];
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.users)
    .where(
      and(
        ne(schema.users.kind, "fan"),
        ne(schema.users.kind, "gym"),
        ne(schema.users.id, userId),
        isNotNull(schema.users.handle),
      ),
    );
  const listable = rows.filter((c) => !!c.handle && c.discoverable !== false);
  const dist = (c: (typeof rows)[number]) =>
    near && typeof c.locationLat === "number" && typeof c.locationLng === "number"
      ? distanceKm(near, { lat: c.locationLat, lng: c.locationLng })
      : Infinity;
  listable.sort((a, b) => {
    const da = dist(a);
    const db2 = dist(b);
    if (da !== db2) return da - db2;
    return Number(!!b.photo) - Number(!!a.photo) || a.name.localeCompare(b.name);
  });
  return listable.slice(0, 6).map((c) => ({
    id: c.id,
    handle: c.handle!,
    name: c.name.trim() || c.email.split("@")[0],
    photo: c.photoThumb ?? c.photo,
    color: avatarColor(c),
    sub: c.title?.trim() || c.disciplines.slice(0, 2).join(", "),
  }));
}
