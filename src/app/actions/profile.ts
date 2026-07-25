"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";

// Profile edits: name, about, and a photo stored as a small data URL. The photo
// is resized client-side; we just guard the size and format here.
export async function updateProfile(input: {
  name: string;
  about: string;
  photo?: string | null; // data URL, "" to clear, undefined to leave as-is
}): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };

  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false, error: "Name can't be empty." };
  const about = input.about.trim().slice(0, 600);

  const set: { name: string; about: string; photo?: string | null } = { name, about };
  if (input.photo !== undefined) {
    const photo = input.photo;
    if (photo && (!photo.startsWith("data:image/") || photo.length > 900_000)) {
      return { ok: false, error: "Photo is too large — try a smaller image." };
    }
    set.photo = photo || null;
  }

  const db = await getDb();
  const [user] = await db
    .update(schema.users)
    .set(set)
    .where(eq(schema.users.id, userId))
    .returning({ handle: schema.users.handle });

  revalidatePath("/app");
  if (user?.handle) revalidatePath(`/${user.handle}`);
  return { ok: true };
}
