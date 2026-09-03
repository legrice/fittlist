"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { buildDiscoverFeed } from "@/lib/discoverfeed";

/**
 * The portion of Home's rolling calendar that is intentionally kept out of
 * the initial document. Today and tomorrow are already interactive before
 * this runs; the longer horizon arrives after first paint and merges by
 * occurrence key.
 */
export async function loadCalendarRemainder() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const db = await getDb();
  const [me] = await db
    .select({
      email: schema.users.email,
      kind: schema.users.kind,
      handle: schema.users.handle,
      location: schema.users.location,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me) return null;

  const feed = await buildDiscoverFeed(userId, me, {
    calendarOnly: true,
    startDay: 2,
    endDay: 180,
  });
  return {
    items: feed.items,
    coaches: feed.rail,
    myRail: feed.myRail,
    cats: feed.cats,
  };
}
