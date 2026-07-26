import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { adminEmails } from "@/lib/admin";

// Shown wherever a non-invited email tries to create an account.
export const INVITE_MSG =
  "Fittlist is invite-only during beta. Use the email you were invited with, or ask for an invite.";

// Invite gating is on unless explicitly disabled (INVITE_ONLY=false opens
// self-serve signups when the beta ends).
export function inviteOnly(): boolean {
  return process.env.INVITE_ONLY !== "false";
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

// Stamp the invite as accepted by the new user (best-effort).
export async function acceptInvite(emailRaw: string, userId: string): Promise<void> {
  try {
    const db = await getDb();
    await db
      .update(schema.invites)
      .set({ acceptedUserId: userId, acceptedAt: new Date() })
      .where(and(eq(schema.invites.email, norm(emailRaw)), isNull(schema.invites.acceptedAt)));
  } catch {
    /* never block signup on attribution */
  }
}
