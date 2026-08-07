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

/** Everyone this address follows, shaped for the directory's own
 *  PersonRow: the Following tab a profile wears now, by Matt's call (it
 *  reverses the old "a follow is private" line, in as many words; his
 *  reasons: safety, Instagram's convention, and list management, with
 *  follower counts unshown so it is no scoreboard). Anyone followed with
 *  a page is listed; gym accounts have no handle and drop out on that.
 *
 *  Each row carries the VIEWER'S relationship to that person, so the pill
 *  is the easy unfollow on your own list and the Instagram-style follow
 *  door on somebody else's. */
export type FollowRow = {
  id: string;
  handle: string;
  name: string;
  kind: "coach" | "member";
  photo: string | null;
  title: string;
  location: string;
  classesThisWeek: number;
  following: boolean;
  requested: boolean;
  availability: string | null;
  color: string;
  disciplines: string[];
};

export async function followingList(email: string, viewerId?: string | null): Promise<FollowRow[]> {
  const db = await getDb();
  const subs = await db
    .select({ trainerUserId: schema.subscribers.trainerUserId })
    .from(schema.subscribers)
    .where(and(eq(schema.subscribers.email, email), isNull(schema.subscribers.optedOutAt)));
  const ids = subs.map((s) => s.trainerUserId);
  if (!ids.length) return [];

  // The viewer's own follows and pending asks, so each row's pill starts
  // right. On your own list that set is the list itself.
  let viewerFollows = new Set<string>();
  let viewerAsks = new Set<string>();
  if (viewerId) {
    const [viewer] = await db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, viewerId));
    if (viewer) {
      const [f, r] = await Promise.all([
        db
          .select({ trainerUserId: schema.subscribers.trainerUserId })
          .from(schema.subscribers)
          .where(and(eq(schema.subscribers.email, viewer.email), isNull(schema.subscribers.optedOutAt))),
        db
          .select({ trainerUserId: schema.followRequests.trainerUserId })
          .from(schema.followRequests)
          .where(eq(schema.followRequests.requesterUserId, viewerId)),
      ]);
      viewerFollows = new Set(f.map((x) => x.trainerUserId));
      viewerAsks = new Set(r.map((x) => x.trainerUserId));
    }
  }

  const users = await db.select().from(schema.users).where(inArray(schema.users.id, ids));
  return users
    .filter((u) => !!u.handle)
    .map((u) => ({
      id: u.id,
      handle: u.handle!,
      name: u.name.trim() || u.email.split("@")[0],
      kind: (u.kind === "fan" ? "member" : "coach") as "coach" | "member",
      photo: u.photo,
      title: u.title?.trim() ?? "",
      location: u.location ?? "",
      classesThisWeek: 0,
      following: viewerFollows.has(u.id),
      requested: viewerAsks.has(u.id),
      availability: u.kind === "fan" ? null : u.availability,
      color: avatarColor(u),
      disciplines: u.disciplines ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
