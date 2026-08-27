"use server";

import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { adminEmails } from "@/lib/admin";
import { avatarColor } from "@/lib/avatar";
import { INVITES_PER_USER, invitesCapped, inviteOnly } from "@/lib/invites";
import { inviteBannerCountFor } from "@/lib/invite-banner";
import { joinCodeFor, joinUrl } from "@/lib/joinlink";
import { getSessionUserId } from "@/lib/session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Public: a non-invited coach asks to be let into the beta. Recorded for the
// admin to act on. Deduped by email (a repeat request reopens a handled one).
export async function requestInvite(
  nameRaw: string,
  emailRaw: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!inviteOnly()) {
    void nameRaw;
    void emailRaw;
    return { ok: false, error: "Invites aren’t required. Create your account directly." };
  }
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
  if (!me) return 0;
  return inviteBannerCountFor({
    id: userId,
    email: me.email,
    onboardedAt: me.onboardedAt,
    invitesBannerAt: me.dismissed,
  });
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

export type JoinedPerson = {
  /** Their name once they've set one, otherwise the address they used. */
  who: string;
  handle: string | null;
  photo: string | null;
  color: string;
  joined: boolean;
};

/** Their share link, and everyone who has come in through them. */
export async function myInvites(): Promise<{
  left: number;
  total: number;
  url: string;
  people: JoinedPerson[];
}> {
  const userId = await getSessionUserId();
  if (!userId) return { left: 0, total: 0, url: "", people: [] };
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  // Left join: an emailed invite that nobody has taken up yet has no user to
  // show, and it still belongs on the list as a pending one.
  const rows = await db
    .select({
      email: schema.invites.email,
      acceptedAt: schema.invites.acceptedAt,
      userId: schema.users.id,
      name: schema.users.name,
      handle: schema.users.handle,
      photo: schema.users.photo,
      avatarColor: schema.users.avatarColor,
    })
    .from(schema.invites)
    .leftJoin(schema.users, eq(schema.users.id, schema.invites.acceptedUserId))
    .where(eq(schema.invites.invitedByUserId, userId))
    .orderBy(sql`${schema.invites.createdAt} desc`);
  const unlimited = !invitesCapped() || (!!me && adminEmails().includes(me.email.toLowerCase()));
  return {
    left: unlimited ? Infinity : Math.max(0, INVITES_PER_USER - rows.length),
    total: unlimited ? Infinity : INVITES_PER_USER,
    url: joinUrl(await joinCodeFor(userId)),
    people: rows.map((r) => ({
      who: r.name?.trim() || r.email,
      handle: r.handle,
      photo: r.photo,
      color: avatarColor({ id: r.userId ?? r.email, avatarColor: r.avatarColor }),
      joined: !!r.acceptedAt,
    })),
  };
}
