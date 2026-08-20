import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * A roster entry is a position, not an account.
 *
 * A studio putting next week together cannot wait for every coach to sign up,
 * so a shift has to be assignable to somebody who is not on fittlist yet. The
 * way that works here is a real `users` row that nobody can sign into: a
 * synthetic address at a domain that cannot receive mail, no handle, not
 * discoverable. `studios.accountUserId` already does exactly this for a gym,
 * so this is that idea used a second time rather than a new one.
 *
 * The payoff is that nothing downstream has to learn about it.
 * `classes.coachUserId`, `shift_covers.coachUserId`, `gymCounts`, the private
 * calendar feed and every notification just see a user id. The alternative,
 * a nullable user plus a name on the roster row, would have meant teaching
 * all of those that a shift might be held by something that is not a user,
 * which is a change to the rota's whole spine for the sake of one state.
 */
export const PLACEHOLDER_KIND = "placeholder";

/** Kinds that are not a person with an account: excluded from people counts,
 *  from Discover, and from anything that would try to email them. */
export const NON_PERSON_KINDS = ["gym", PLACEHOLDER_KIND];

/** An address nobody can receive mail at or sign up with. */
function placeholderEmail(studioId: string): string {
  return `roster.${studioId}.${crypto.randomUUID()}@roster.fittlist.invalid`;
}

/**
 * A name on the rota, holding shifts, before that person is on fittlist.
 *
 * The email and phone are where an invite goes, not a way to reach the
 * account: the account has no inbox. They live on the roster row rather than
 * on the user, because they are the studio's note about how to invite this
 * person, and they stop meaning anything the moment the real account arrives.
 */
export async function createPlaceholderCoach(input: {
  studioId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}): Promise<{ userId: string }> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [account] = await tx
      .insert(schema.users)
      .values({
        kind: PLACEHOLDER_KIND,
        email: placeholderEmail(input.studioId),
        name: input.name.trim() || "Coach",
        handle: null,
        discoverable: false,
        onboardedAt: new Date(),
      })
      .returning();
    await tx.insert(schema.studioRotaCoaches).values({
      studioId: input.studioId,
      userId: account.id,
      state: "placeholder",
      invitedEmail: input.email?.trim().toLowerCase() || null,
      invitedPhone: input.phone?.trim() || null,
      invitedAt: input.email?.trim() || input.phone?.trim() ? new Date() : null,
    });
    return { userId: account.id };
  });
}

/**
 * The placeholder becomes the person.
 *
 * Everything the position was holding moves onto the real account, and the
 * placeholder goes. Nothing is re-entered, which is the whole promise of the
 * position model: the shifts a manager assigned last week are that coach's
 * shifts the moment they accept, and they appear on their public schedule
 * with their own name and face on them.
 *
 * The order matters only in that the rota row is dealt with last: the unique
 * index is per (studio, user), so a real account already on this rota would
 * collide with the placeholder's row. When that happens the placeholder's row
 * is dropped rather than moved, because the person is already on the list and
 * one of the two rows has to lose.
 */
export async function mergePlaceholderInto(
  placeholderUserId: string,
  realUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (placeholderUserId === realUserId) return { ok: true };
  const db = await getDb();
  const [ph] = await db
    .select({ kind: schema.users.kind })
    .from(schema.users)
    .where(eq(schema.users.id, placeholderUserId));
  if (!ph) return { ok: false, error: "That entry is gone." };
  // Only a placeholder may be merged away. A real account being folded into
  // another is a different act with different consequences, and it is not
  // this one.
  if (ph.kind !== PLACEHOLDER_KIND) return { ok: false, error: "That is a real account." };

  // The standing assignment on a slot, and the one-off covers over it. Both
  // are just "who is on", so both move.
  await db
    .update(schema.classes)
    .set({ coachUserId: realUserId })
    .where(eq(schema.classes.coachUserId, placeholderUserId));
  await db
    .update(schema.shiftCovers)
    .set({ coachUserId: realUserId })
    .where(eq(schema.shiftCovers.coachUserId, placeholderUserId));
  // Who wrote a cover down is a fact about the past; it still points at
  // somebody real once the placeholder is gone.
  await db
    .update(schema.shiftCovers)
    .set({ createdByUserId: realUserId })
    .where(eq(schema.shiftCovers.createdByUserId, placeholderUserId));

  const rows = await db
    .select({
      id: schema.studioRotaCoaches.id,
      studioId: schema.studioRotaCoaches.studioId,
      onSchedule: schema.studioRotaCoaches.onSchedule,
    })
    .from(schema.studioRotaCoaches)
    .where(eq(schema.studioRotaCoaches.userId, placeholderUserId));
  for (const row of rows) {
    const [already] = await db
      .select({
        id: schema.studioRotaCoaches.id,
        onSchedule: schema.studioRotaCoaches.onSchedule,
      })
      .from(schema.studioRotaCoaches)
      .where(
        and(
          eq(schema.studioRotaCoaches.studioId, row.studioId),
          eq(schema.studioRotaCoaches.userId, realUserId),
        ),
      );
    if (already) {
      await db
        .update(schema.studioRotaCoaches)
        .set({
          state: "active",
          onSchedule: already.onSchedule || row.onSchedule,
          acceptedAt: new Date(),
          invitedEmail: null,
          invitedPhone: null,
        })
        .where(eq(schema.studioRotaCoaches.id, already.id));
      await db.delete(schema.studioRotaCoaches).where(eq(schema.studioRotaCoaches.id, row.id));
    } else {
      await db
        .update(schema.studioRotaCoaches)
        .set({
          userId: realUserId,
          state: "active",
          acceptedAt: new Date(),
          invitedEmail: null,
          invitedPhone: null,
        })
        .where(eq(schema.studioRotaCoaches.id, row.id));
    }
  }

  await db.delete(schema.users).where(eq(schema.users.id, placeholderUserId));
  return { ok: true };
}

/**
 * A coach may receive their studio invitation before they create a FittList
 * account. When they do join, claim every placeholder that was invited to the
 * same address so their already-assigned shifts follow them automatically.
 */
export async function claimRosterPlaceholders(emailRaw: string, realUserId: string): Promise<boolean> {
  const email = emailRaw.trim().toLowerCase();
  if (!email) return false;
  const db = await getDb();
  const rows = await db
    .select({ userId: schema.studioRotaCoaches.userId })
    .from(schema.studioRotaCoaches)
    .where(
      and(
        eq(schema.studioRotaCoaches.invitedEmail, email),
        eq(schema.studioRotaCoaches.state, "placeholder"),
      ),
    );
  if (!rows.length) return false;
  // A roster invite is specifically an invitation to coach. The generic
  // fallback signup can otherwise create a member account before this claim
  // runs, which would make the newly linked coach disappear from every
  // assignment picker. Carry the role encoded by the invitation through the
  // merge instead of leaving a broken active roster row pointing at a fan.
  await db
    .update(schema.users)
    .set({ kind: "coach" })
    .where(eq(schema.users.id, realUserId));
  for (const row of rows) await mergePlaceholderInto(row.userId, realUserId);
  return true;
}
