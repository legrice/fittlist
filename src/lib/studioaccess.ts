import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentAdmin } from "@/lib/admin";

// Who may edit a studio, in one place, because the answer has two halves and
// they are easy to get out of step.
//
// The directory has always run on trust: an entry nobody owns is better kept
// right by the coaches who teach there than left wrong, so any coach can edit
// any studio. That stays true, and it is the normal state of almost every row
// in the table.
//
// A claimed studio is different. Once the gym itself is running the page, its
// details are the gym's to state, and a well-meaning correction from someone
// who teaches there on Tuesdays is no longer a help. So from the first manager
// on, only the managers (and the site admin) may edit, and everyone else gets
// the same Suggest an edit door visitors already have.

export type StudioAccess = {
  /** Somebody runs this page: it is no longer the commons. */
  claimed: boolean;
  managerIds: string[];
  /** This viewer may open the editor. */
  canEdit: boolean;
  /** This viewer runs the place, as opposed to merely being allowed to fix it. */
  isManager: boolean;
};

export async function studioManagerIds(studioId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ userId: schema.studioManagers.userId })
    .from(schema.studioManagers)
    .where(eq(schema.studioManagers.studioId, studioId));
  return rows.map((r) => r.userId);
}

/**
 * `viewer` is null for a signed-out visitor. `kind` decides the unclaimed case
 * the same way it always has: a coach is kind, never handle, because members
 * hold handles too.
 */
export async function studioAccess(
  studioId: string,
  viewer: { id: string; kind: string } | null,
): Promise<StudioAccess> {
  const managerIds = await studioManagerIds(studioId);
  const claimed = managerIds.length > 0;
  if (!viewer) return { claimed, managerIds, canEdit: false, isManager: false };
  const isManager = managerIds.includes(viewer.id);
  // The site admin keeps the keys to every page: a gym that locks itself out,
  // or claims a studio it has no business claiming, has to be fixable.
  const admin = await currentAdmin();
  const canEdit = isManager || !!admin || (!claimed && viewer.kind !== "fan");
  return { claimed, managerIds, canEdit, isManager };
}
