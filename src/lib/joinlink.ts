import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb, schema } from "@/db";
import { siteOrigin } from "@/lib/format";

// The share link: fittlist.co/j/{code}.
//
// One link per account, permanent, no email involved. Somebody sends it, and
// whoever opens it can create an account even though the beta gate is up. The
// gate still means something: you can't get in without a link from someone who
// is already here. It just stops being a list of addresses we have to be told
// in advance.
//
// Opening the link only sets a cookie. Nothing is created until they actually
// sign up, so a link shared into a group chat costs nothing when it's ignored,
// and the same link works for as many people as it reaches.

/** Where the code lives between opening the link and finishing signup. */
const COOKIE = "fl_join";
const COOKIE_DAYS = 30;

// Ambiguity-free alphabet: no 0/O, no 1/I/l. These get read aloud and typed by
// hand, and a code somebody can't dictate is a code that loses people.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const LENGTH = 8;

function mint(): string {
  const bytes = randomBytes(LENGTH);
  let out = "";
  for (let i = 0; i < LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** This account's code, minting one the first time it's asked for. */
export async function joinCodeFor(userId: string): Promise<string> {
  const db = await getDb();
  const [me] = await db
    .select({ code: schema.users.inviteCode })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (me?.code) return me.code;
  // The column is unique, so a collision is a retry rather than a corrupt row.
  for (let i = 0; i < 5; i++) {
    const code = mint();
    try {
      await db.update(schema.users).set({ inviteCode: code }).where(eq(schema.users.id, userId));
      return code;
    } catch {
      /* taken; try another */
    }
  }
  throw new Error("could not mint a join code");
}

export function joinUrl(code: string): string {
  return `${siteOrigin()}/j/${code}`;
}

export type Inviter = {
  id: string;
  name: string;
  handle: string | null;
  photo: string | null;
  email: string;
};

/** Whose link is this? Null for a code that was never minted. */
export async function inviterByCode(codeRaw: string): Promise<Inviter | null> {
  const code = codeRaw.trim().toLowerCase();
  if (!/^[a-z0-9]{4,32}$/.test(code)) return null;
  const db = await getDb();
  const [row] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      handle: schema.users.handle,
      photo: schema.users.photo,
      email: schema.users.email,
    })
    .from(schema.users)
    .where(eq(schema.users.inviteCode, code));
  return row ?? null;
}

/** Remember the link this visitor arrived on, until they sign up or a month passes. */
export async function rememberJoin(code: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_DAYS * 24 * 60 * 60,
  });
}

/** The link this visitor is currently carrying, resolved to whoever owns it. */
export async function pendingInviter(): Promise<Inviter | null> {
  const jar = await cookies();
  const code = jar.get(COOKIE)?.value;
  if (!code) return null;
  return inviterByCode(code);
}

/** Spent. Called once the account exists, so the next signup starts clean. */
export async function clearJoin(): Promise<void> {
  try {
    const jar = await cookies();
    jar.delete(COOKIE);
  } catch {
    /* not in a request that can write cookies; the maxAge covers it */
  }
}
