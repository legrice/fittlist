"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { shareWeek } from "@/lib/shareweek";

// The composer's data door. The picture is drawn by an image route, but the
// screen still needs the same rows in words: the Classes sheet lists them, and
// the count under it has to be the count on the picture. One loader answers
// both (`shareWeek`), which is what stops the sheet and the image disagreeing.

export type ShareRow = {
  key: string;
  iso: string;
  /** "Wed 6:00p", the way the sheet says it. */
  when: string;
  name: string;
  /** The place, and whose class it is, joined the way the picture joins them. */
  sub: string;
};

/**
 * Every class in the range, whether or not it is currently hidden.
 *
 * Deliberately session-derived rather than taking a user id: this is exported
 * from a `"use server"` file, so a parameter would be a callable endpoint for
 * reading anybody's week.
 */
export async function shareRows(input: {
  from: string;
  days: number;
}): Promise<ShareRow[]> {
  const userId = await getSessionUserId();
  if (!userId) return [];
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return [];
  const days = Math.min(7, Math.max(1, Math.round(input.days) || 7));
  // The hide set is the screen's own state and never reaches here: this is
  // the whole range, and the sheet ticks its own boxes over the top.
  const week = await shareWeek(userId, input.from, days);
  return week.flatMap((d) =>
    d.items.map((i) => ({
      key: i.key,
      iso: i.iso,
      when: `${d.day.slice(0, 3)} ${i.time}`,
      name: i.name,
      sub: [i.who, i.where].filter(Boolean).join(" · "),
    })),
  );
}
