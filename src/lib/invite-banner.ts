import "server-only";

import { count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { adminEmails } from "@/lib/admin";
import { INVITES_PER_USER, invitesCapped, inviteOnly } from "@/lib/invites";

export type InviteBannerViewer = {
  id: string;
  email: string;
  onboardedAt: Date | null;
  invitesBannerAt: Date | null;
};

/** Banner eligibility using the identity the app shell already loaded. */
export async function inviteBannerCountFor(me: InviteBannerViewer): Promise<number> {
  if (!inviteOnly() || !me.onboardedAt || me.invitesBannerAt) return 0;
  if (adminEmails().includes(me.email.toLowerCase())) return 0;
  if (!invitesCapped()) return -1;
  const db = await getDb();
  const [row] = await db
    .select({ n: count() })
    .from(schema.invites)
    .where(eq(schema.invites.invitedByUserId, me.id));
  return Math.max(0, INVITES_PER_USER - Number(row?.n ?? 0));
}
