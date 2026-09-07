"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { buildDiscoverFeed } from "@/lib/discoverfeed";
import { followingMonthWindow } from "@/lib/calendar-window";
import { todayIso } from "@/lib/format";

/**
 * The portion of Home's rolling calendar that is intentionally kept out of
 * the initial document. Today and tomorrow are already interactive before
 * this runs; days 2–30 arrive after first paint and merge by occurrence key.
 * Further months are fetched only when the viewer opens them.
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
    endDay: 30,
  });
  return {
    items: feed.items,
    coaches: feed.rail,
    myRail: feed.myRail,
    cats: feed.cats,
  };
}

/** Public server-action input is checked at runtime, before date expansion.
 * The same feed path preserves follow, block, visibility and recurrence rules. */
export async function loadFollowingCalendarMonth(month: string) {
  const window = followingMonthWindow(month, todayIso());
  if (!window) throw new Error("Choose a month within the next five years.");
  const userId = await getSessionUserId();
  if (!userId) return null;
  const db = await getDb();
  const [me] = await db.select({
    email: schema.users.email,
    kind: schema.users.kind,
    handle: schema.users.handle,
    location: schema.users.location,
  }).from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return null;
  const feed = await buildDiscoverFeed(userId, me, { calendarOnly: true, dateWindow: window });
  return { month: window.month, from: window.from, through: window.through,
    items: feed.items, coaches: feed.rail, myRail: feed.myRail, cats: feed.cats };
}
