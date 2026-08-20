import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";

/** Somebody a shift can be handed to: a face, a name, and the id the action
 *  takes. The face is not decoration here. This list is read in the moment
 *  somebody is deciding who to hand a class to, and a column of identical
 *  glyphs makes eight colleagues into eight rows of text to parse; the
 *  picture is how you find the person you already had in mind. */
export type Sendable = {
  id: string;
  name: string;
  photo: string | null;
  color: string;
};

/**
 * Who a shift at this studio may be handed to: the gym's own shift list,
 * minus whoever is asking.
 *
 * A plain module rather than an export from `gym.ts`, on purpose. That file
 * is `"use server"`, so anything exported from it is a callable endpoint, and
 * "give me the coaches at studio X" is not a question a stranger should be
 * able to ask by posting an id. Here it is an ordinary function that only the
 * server actions and loaders can reach.
 *
 * It is one function because it was two. `classDetail` and `staffView` each
 * built this list, identically, which held for exactly as long as nobody
 * changed one of them: the two sheets are the same sheet from two doors, and
 * a face on one and a glyph on the other is the drift this rule exists to
 * stop.
 *
 * `studio_rota_coaches` is the managers' own list rather than everyone who
 * says they coach here, and `sendShiftTo` refuses anybody not on it. This and
 * that action have to read the same table, or the sheet offers a name the
 * action then rejects.
 */
export async function sendableAt(studioId: string, exceptUserId: string): Promise<Sendable[]> {
  const db = await getDb();
  const pool = await db
    .select({ userId: schema.studioRotaCoaches.userId })
    .from(schema.studioRotaCoaches)
    .where(
      and(
        eq(schema.studioRotaCoaches.studioId, studioId),
        // A coach the studio has not confirmed cannot receive a shift yet.
        // Invited coaches may: the roster model deliberately lets a studio
        // prepare their week before they accept the invitation.
        inArray(schema.studioRotaCoaches.state, ["active", "invited"]),
      ),
    );
  const ids = pool.map((p) => p.userId).filter((id) => id !== exceptUserId);
  if (!ids.length) return [];
  const people = await db.select().from(schema.users).where(inArray(schema.users.id, ids));
  return people
    .map((p) => ({
      id: p.id,
      name: p.name.trim() || p.email.split("@")[0],
      photo: p.photo,
      color: avatarColor(p),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
