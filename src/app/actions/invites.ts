"use server";

import { getDb, schema } from "@/db";

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
