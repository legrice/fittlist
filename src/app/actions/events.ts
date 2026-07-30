"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { currentAdmin } from "@/lib/admin";
import { knownLocations } from "@/app/actions/locations";
import { normalizeLocation } from "@/lib/location";
import { getSessionUserId } from "@/lib/session";

export type EventInput = {
  name: string;
  startDate: string; // ISO
  endDate?: string | null; // ISO; empty = one day
  startTime?: string | null; // "HH:MM" 24h; empty = all day
  place: string;
  city?: string | null;
  photo?: string | null; // small data URL, same shape as every other photo
  description?: string | null;
  link?: string | null;
  hostName?: string | null;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// Post a community event. Coaches only, by kind: members' things stay private
// by construction everywhere else, and an open events board is the same wall.
export async function createEvent(
  input: EventInput,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const db = await getDb();
  const [me] = await db
    .select({ kind: schema.users.kind })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me || me.kind === "fan") return { ok: false, error: "Only coaches can post an event." };

  const name = input.name.trim();
  const place = input.place.trim();
  if (!name) return { ok: false, error: "Give the event a name." };
  if (!place) return { ok: false, error: "Say where it is." };
  if (!ISO_DAY.test(input.startDate)) return { ok: false, error: "Pick a date." };
  const endDate = input.endDate?.trim() || input.startDate;
  if (!ISO_DAY.test(endDate) || endDate < input.startDate)
    return { ok: false, error: "The end date can't come before the start." };
  if (input.photo && (!input.photo.startsWith("data:image/") || input.photo.length > 900_000))
    return { ok: false, error: "That image didn't work. Try a smaller one." };
  const link = input.link?.trim() || null;
  if (link && !/^https?:\/\//.test(link))
    return { ok: false, error: "The link needs to start with http." };

  // Same canonical city strings Discover already groups by.
  const city = input.city?.trim()
    ? await (async () => {
        const norm = normalizeLocation(input.city!.trim(), await knownLocations());
        return norm.ok ? norm.value : input.city!.trim();
      })()
    : null;

  const [row] = await db
    .insert(schema.events)
    .values({
      name,
      startDate: input.startDate,
      endDate,
      startTime: input.startTime?.trim() || null,
      place,
      city,
      photo: input.photo || null,
      description: input.description?.trim() || null,
      link,
      hostName: input.hostName?.trim() || null,
      createdByUserId: userId,
    })
    .returning();
  revalidatePath("/discover");
  return { ok: true, id: row.id };
}

// The poster can take their event down; so can the admin. No edit for now:
// delete and repost covers a beta, and a second sheet is scope the feature
// hasn't earned.
export async function deleteEvent(id: string): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const db = await getDb();
  const [ev] = await db.select().from(schema.events).where(eq(schema.events.id, id));
  if (!ev) return { ok: false, error: "Event not found." };
  const admin = await currentAdmin();
  if (ev.createdByUserId !== userId && !admin)
    return { ok: false, error: "Only the poster can remove this." };
  await db.delete(schema.events).where(eq(schema.events.id, id));
  revalidatePath("/discover");
  return { ok: true };
}
