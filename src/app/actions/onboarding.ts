"use server";

import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { avatarColor } from "@/lib/avatar";
import { publicSchedules } from "@/lib/coachweek";
import { runsOn, todayIso, weekDates } from "@/lib/format";

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
  city: string,
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
  const cityKey = city.split(",")[0]?.trim().toLowerCase();
  const local = rows.filter(
    (c) =>
      !!c.handle &&
      c.discoverable !== false &&
      !!(c.photoThumb ?? c.photo) &&
      !!cityKey &&
      c.location?.split(",")[0]?.trim().toLowerCase() === cityKey,
  );
  const schedules = await publicSchedules(local);
  const dates = weekDates(0, todayIso());
  const activeIds = new Set<string>();
  for (const c of schedules) {
    if (!c.isPublic) continue;
    for (const iso of dates) {
      const d = new Date(`${iso}T00:00:00Z`);
      if (runsOn(c, iso, (d.getUTCDay() + 6) % 7)) activeIds.add(c.ownerUserId);
    }
  }
  const listable = local.filter((c) => activeIds.has(c.id));
  listable.sort((a, b) => a.name.localeCompare(b.name));
  return listable.slice(0, 6).map((c) => ({
    id: c.id,
    handle: c.handle!,
    name: c.name.trim() || c.email.split("@")[0],
    photo: c.photoThumb ?? c.photo,
    color: avatarColor(c),
    sub: c.title?.trim() || c.disciplines.slice(0, 2).join(", "),
  }));
}

/** Turn the browser's coordinates into the same city label LocationPicker
 * stores. Best effort: the manual picker remains available if lookup fails. */
export async function cityFromCoordinates(
  lat: number,
  lng: number,
): Promise<{ ok: boolean; location?: string; lat?: number; lng?: number }> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false };
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`,
      { headers: { "User-Agent": "fittlist.co (hello@fittlist.co)" }, signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as {
      address?: { city?: string; town?: string; village?: string; municipality?: string; state?: string; "ISO3166-2-lvl4"?: string; country?: string };
    };
    const a = data.address;
    const city = a?.city ?? a?.town ?? a?.village ?? a?.municipality;
    if (!city) return { ok: false };
    const stateCode = a?.["ISO3166-2-lvl4"]?.replace(/^US-/, "");
    const region = stateCode || a?.state || a?.country;
    return { ok: true, location: region ? `${city}, ${region}` : city, lat, lng };
  } catch {
    return { ok: false };
  }
}
