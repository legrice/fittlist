import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";

// Blocking, quietly.
//
// The rule everywhere: if A has blocked B, then for B the coach's page simply
// isn't there. Not "you have been blocked", not a greyed-out follow button, no
// row in a list saying why. A notice is an invitation to make a second account
// and come back angrier, and it hands someone a fact about you that they can
// act on. A 404 is what a deleted account looks like, so it says nothing.
//
// Directional: A blocking B says nothing about B blocking A.

/** Is `viewer` blocked by `owner`? */
export async function isBlocked(ownerId: string, viewerId: string | null): Promise<boolean> {
  if (!viewerId || viewerId === ownerId) return false;
  const db = await getDb();
  const [row] = await db
    .select({ id: schema.blocks.id })
    .from(schema.blocks)
    .where(
      and(
        eq(schema.blocks.blockerUserId, ownerId),
        eq(schema.blocks.blockedUserId, viewerId),
      ),
    );
  return !!row;
}

/** Everyone who has blocked this viewer. Used to filter lists in one query. */
export async function blockedBy(viewerId: string | null): Promise<Set<string>> {
  if (!viewerId) return new Set();
  const db = await getDb();
  const rows = await db
    .select({ blockerUserId: schema.blocks.blockerUserId })
    .from(schema.blocks)
    .where(eq(schema.blocks.blockedUserId, viewerId));
  return new Set(rows.map((r) => r.blockerUserId));
}

/** Everyone this viewer has blocked, so their own lists stay clean too. */
export async function blocking(viewerId: string | null): Promise<Set<string>> {
  if (!viewerId) return new Set();
  const db = await getDb();
  const rows = await db
    .select({ blockedUserId: schema.blocks.blockedUserId })
    .from(schema.blocks)
    .where(eq(schema.blocks.blockerUserId, viewerId));
  return new Set(rows.map((r) => r.blockedUserId));
}

/** Both directions at once: anyone this viewer shouldn't see, or be seen by. */
export async function hiddenFrom(viewerId: string | null): Promise<Set<string>> {
  if (!viewerId) return new Set();
  const [them, mine] = await Promise.all([blockedBy(viewerId), blocking(viewerId)]);
  return new Set([...them, ...mine]);
}

/** The rows a block has to clean up: their follow of you goes with it. */
export async function dropFollow(ownerId: string, blockedId: string): Promise<void> {
  const db = await getDb();
  const [them] = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, blockedId));
  if (!them) return;
  // A follow is keyed on email (an email-only subscriber who later made an
  // account never got the userId backfilled), so clear both shapes.
  await db
    .delete(schema.subscribers)
    .where(
      and(eq(schema.subscribers.trainerUserId, ownerId), eq(schema.subscribers.email, them.email)),
    );
  await db
    .delete(schema.subscribers)
    .where(
      and(eq(schema.subscribers.trainerUserId, ownerId), eq(schema.subscribers.userId, blockedId)),
    );
  // And their marks on your classes: they can't see the schedule any more, so
  // leaving them on it would be a list of things they can't reach.
  const own = await db
    .select({ id: schema.classes.id })
    .from(schema.classes)
    .where(eq(schema.classes.userId, ownerId));
  const ids = own.map((c) => c.id);
  if (ids.length) {
    await db
      .delete(schema.attendances)
      .where(
        and(eq(schema.attendances.userId, blockedId), inArray(schema.attendances.classId, ids)),
      );
  }
}
