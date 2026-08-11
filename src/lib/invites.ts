import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { adminEmails } from "@/lib/admin";
import { clearJoin, pendingInviter } from "@/lib/joinlink";

// Shown wherever a non-invited email tries to create an account. The signup
// screen also renders a "Request an invite" link next to it.
export const INVITE_MSG =
  "Fittlist is invite-only during beta. Open a share link from someone already on it, use the email you were invited with, or request an invite below.";

// How many people one beta user may bring in. Nobody is capped: the gate is
// still on, so every account still arrives through someone, but rationing how
// many friends a coach can bring was a brake on the only thing that grows this.
// The number stays configurable, so a cap can come back without new plumbing;
// 0 means no limit.
export const INVITES_PER_USER = Number(process.env.BETA_INVITES_PER_USER || 0);
export const invitesCapped = () => INVITES_PER_USER > 0;

// Signup is public now. Invite links remain useful for attribution and a warm
// introduction, but they are no longer a gate somebody has to pass.
export function inviteOnly(): boolean {
  return false;
}

const norm = (e: string) => e.trim().toLowerCase();

// May this email create a brand-new account? Callers only reach this on the
// new-user branch, so existing accounts are unaffected. Admins are always
// allowed so the founder can bootstrap.
export async function emailInvited(emailRaw: string): Promise<boolean> {
  if (!inviteOnly()) return true;
  const email = norm(emailRaw);
  if (adminEmails().includes(email)) return true;
  const db = await getDb();
  const [inv] = await db
    .select({ id: schema.invites.id })
    .from(schema.invites)
    .where(eq(schema.invites.email, email));
  return !!inv;
}

// May this person create an account? Either their address was invited, or they
// arrived on somebody's share link. The gate is the same either way: you get in
// through someone who is already here.
export async function signupAllowed(emailRaw: string): Promise<boolean> {
  if (await emailInvited(emailRaw)) return true;
  return !!(await pendingInviter());
}

// Stamp the invite as accepted by the new user (best-effort).
//
// Two ways in, one row at the end of both. An emailed invite already has a row
// waiting and this stamps it; a share link has nothing, so the row is written
// here, attributed to whoever owns the link. That's what makes "who joined from
// my link" and the admin's referral view the same question with one answer.
export async function acceptInvite(emailRaw: string, userId: string): Promise<void> {
  const email = norm(emailRaw);
  try {
    const db = await getDb();
    const stamped = await db
      .update(schema.invites)
      .set({ acceptedUserId: userId, acceptedAt: new Date() })
      .where(and(eq(schema.invites.email, email), isNull(schema.invites.acceptedAt)))
      .returning({ id: schema.invites.id });
    if (stamped.length) return;
    const via = await pendingInviter();
    if (!via) return;
    await db
      .insert(schema.invites)
      .values({
        email,
        label: `via ${via.name.trim() || "a share link"}'s link`,
        invitedByUserId: via.id,
        acceptedUserId: userId,
        acceptedAt: new Date(),
      })
      .onConflictDoNothing({ target: schema.invites.email });
  } catch {
    /* never block signup on attribution */
  }
  // Spent either way: the next person to sign up in this browser is their own.
  await clearJoin();
}
