import "server-only";
import { count } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { AVATAR_COLORS } from "@/lib/avatar";

// Kept out of lib/avatar.ts on purpose: that module is imported by client
// components for the palette, and pulling the database in with it drags pg
// into the browser bundle.

/** The colour for the next account. Walks the palette in order rather than
    hashing, so the first sixty signups are all visibly different — hashing
    lands three greens in a row often enough to matter at beta scale. */
export async function nextAvatarColor(): Promise<string> {
  const db = await getDb();
  const [row] = await db.select({ n: count() }).from(schema.users);
  return AVATAR_COLORS[(row?.n ?? 0) % AVATAR_COLORS.length];
}
