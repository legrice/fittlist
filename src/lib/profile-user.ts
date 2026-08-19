import "server-only";

import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

/** One profile identity read per server render, shared by metadata and every
 * profile tab route. Some legacy photos are data URLs, so deduping this row
 * saves considerably more than a tiny lookup. */
export const profileUser = cache(async (handle: string) => {
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  return user ?? null;
});
