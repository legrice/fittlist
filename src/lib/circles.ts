import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { hiddenFrom } from "@/lib/blocks";

/**
 * The coaches you follow, as circles.
 *
 * The tray is the whole of what following buys you now. It used to deliver a
 * coach's classes onto your week, which meant saving barely changed the screen
 * and was therefore a terrible way to find out whether anybody saves. Now
 * following puts a face at the top of your Schedule, tapping it shows their
 * week, and saving from there is what fills your calendar. That makes these
 * circles load-bearing rather than decoration, and it makes the ring the most
 * important pixel on the screen.
 */
export type Circle = {
  id: string;
  name: string;
  /** First name only under the circle: six full names is a wall of text. */
  first: string;
  handle: string | null;
  photo: string | null;
  color: string;
  /** They have put classes up since you last opened their peek. Null
   *  `peekedAt` counts as new, because somebody you just followed and have
   *  never looked at has, by definition, everything to show you. */
  fresh: boolean;
};

export async function myCircles(userId: string): Promise<Circle[]> {
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return [];

  // By email, the way every other follow lookup does it: somebody who followed
  // before signing in still counts once the address has an account.
  const rows = await db
    .select({ trainerUserId: schema.subscribers.trainerUserId, peekedAt: schema.subscribers.peekedAt })
    .from(schema.subscribers)
    .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt)));
  const hidden = await hiddenFrom(userId);
  const follows = rows.filter((r) => r.trainerUserId !== userId && !hidden.has(r.trainerUserId));
  if (!follows.length) return [];

  const ids = [...new Set(follows.map((r) => r.trainerUserId))];
  const people = await db.select().from(schema.users).where(inArray(schema.users.id, ids));
  const byId = new Map(people.map((u) => [u.id, u]));

  // When each of them last put a class up. `createdAt` on the class rather
  // than an edit stamp: the ring promises new classes, and a coach fixing a
  // typo should not light six people's circles.
  const seenSince = new Map<string, Date | null>();
  for (const f of follows) seenSince.set(f.trainerUserId, f.peekedAt);
  const newest = new Map<string, Date>();
  for (const c of await db
    .select({ userId: schema.classes.userId, createdAt: schema.classes.createdAt })
    .from(schema.classes)
    .where(and(inArray(schema.classes.userId, ids), eq(schema.classes.isPublic, true)))) {
    const cur = newest.get(c.userId);
    if (!cur || c.createdAt > cur) newest.set(c.userId, c.createdAt);
  }

  return ids
    .map((id) => {
      const u = byId.get(id);
      if (!u) return null;
      const seen = seenSince.get(id) ?? null;
      const last = newest.get(id) ?? null;
      const name = u.name.trim() || u.email.split("@")[0];
      return {
        id,
        name,
        first: name.split(/\s+/)[0],
        handle: u.handle,
        photo: u.photo,
        color: avatarColor(u),
        // Never looked is new; otherwise, anything put up since you looked.
        fresh: !!last && (!seen || last > seen),
      } satisfies Circle;
    })
    .filter((c): c is Circle => !!c)
    // The ones with something to show first: a tray is read left to right and
    // only its first few are seen without a swipe.
    .sort((a, b) => Number(b.fresh) - Number(a.fresh) || a.first.localeCompare(b.first));
}
