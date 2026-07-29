"use server";

import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { adminEmails } from "@/lib/admin";
import { INVITES_PER_USER, inviteOnly } from "@/lib/invites";
import { sendInviteLink } from "@/lib/invite-link";
import { getSessionUserId } from "@/lib/session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Public: a non-invited coach asks to be let into the beta. Recorded for the
// admin to act on. Deduped by email (a repeat request reopens a handled one).
export async function requestInvite(
  nameRaw: string,
  emailRaw: string,
): Promise<{ ok: boolean; error?: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "That doesn't look like an email address." };
  const name = nameRaw.trim().slice(0, 80);

  const db = await getDb();
  await db
    .insert(schema.inviteRequests)
    .values({ name, email })
    .onConflictDoUpdate({
      target: schema.inviteRequests.email,
      set: { name, handledAt: null },
    });
  return { ok: true };
}

// Is there anything for the banner to say? Invites only mean something while
// the beta gate is up: with self-serve signups open, telling someone they have
// five invites is telling them about a door that isn't locked.
export async function invitesBannerCount(): Promise<number> {
  if (!inviteOnly()) return 0;
  const userId = await getSessionUserId();
  if (!userId) return 0;
  const db = await getDb();
  const [me] = await db
    .select({
      email: schema.users.email,
      onboardedAt: schema.users.onboardedAt,
      dismissed: schema.users.invitesBannerAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  // Mid-setup, or they've already closed it.
  if (!me || !me.onboardedAt || me.dismissed) return 0;
  // Admins have no cap, so there's no number to announce.
  if (adminEmails().includes(me.email.toLowerCase())) return 0;
  const rows = await db
    .select({ id: schema.invites.id })
    .from(schema.invites)
    .where(eq(schema.invites.invitedByUserId, userId));
  return Math.max(0, INVITES_PER_USER - rows.length);
}

// Closing it is permanent. The settings row is the door that stays; this was
// only ever there to say the door exists.
export async function dismissInvitesBanner(): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) return;
  const db = await getDb();
  await db
    .update(schema.users)
    .set({ invitesBannerAt: new Date() })
    .where(eq(schema.users.id, userId));
}

/** How many invites this user has left, and how their existing ones are doing. */
export async function myInvites(): Promise<{
  left: number;
  total: number;
  sent: { email: string; joined: boolean }[];
}> {
  const userId = await getSessionUserId();
  if (!userId) return { left: 0, total: 0, sent: [] };
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  const rows = await db
    .select({ email: schema.invites.email, acceptedAt: schema.invites.acceptedAt })
    .from(schema.invites)
    .where(eq(schema.invites.invitedByUserId, userId))
    .orderBy(sql`${schema.invites.createdAt} desc`);
  const unlimited = !!me && adminEmails().includes(me.email.toLowerCase());
  const total = unlimited ? Infinity : INVITES_PER_USER;
  return {
    left: unlimited ? Infinity : Math.max(0, INVITES_PER_USER - rows.length),
    total,
    sent: rows.map((r) => ({ email: r.email, joined: !!r.acceptedAt })),
  };
}

// A beta user brings someone in. Same invite row and the same emailed link the
// admin panel sends — the only difference is who invited_by_user_id points at,
// which is what makes the admin's referral view possible at all.
export async function inviteFriend(
  emailRaw: string,
  noteRaw = "",
): Promise<{ ok: boolean; left?: number; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Log in first." };
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "That doesn't look like an email address." };

  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return { ok: false, error: "Log in first." };
  if (email === me.email) return { ok: false, error: "That's your own email." };

  const unlimited = adminEmails().includes(me.email.toLowerCase());
  const mine = await db
    .select({ id: schema.invites.id })
    .from(schema.invites)
    .where(eq(schema.invites.invitedByUserId, userId));
  if (!unlimited && mine.length >= INVITES_PER_USER) {
    return { ok: false, error: "You've used all your invites for now." };
  }

  // Already here, or already invited by someone else: say so rather than
  // spending one of their invites on a no-op.
  const [existingUser] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  if (existingUser) return { ok: false, error: "They already have a fittlist account." };
  const [existingInvite] = await db
    .select({ id: schema.invites.id })
    .from(schema.invites)
    .where(eq(schema.invites.email, email));
  if (existingInvite) return { ok: false, error: "That email is already invited." };

  const inviterName = me.name.trim() || me.email.split("@")[0];
  const note = noteRaw.trim().slice(0, 120);
  await db.insert(schema.invites).values({
    email,
    // The label is what the admin reads at a glance, so it carries the referral
    // even before anyone joins.
    label: note ? `${note} · via ${inviterName}` : `via ${inviterName}`,
    invitedByUserId: userId,
  });

  await sendInviteLink({
    email,
    subject: `${inviterName} invited you to the fittlist beta`,
    intro: `${inviterName} invited you to try fittlist, which is still in a closed beta. It's a link in bio for group-fitness coaches: your week across every studio, and every way to book you, on one page. Tap to set yours up:`,
    invite: true,
  });

  return { ok: true, left: unlimited ? Infinity : INVITES_PER_USER - mine.length - 1 };
}
