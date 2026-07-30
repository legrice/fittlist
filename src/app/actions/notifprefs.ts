"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";

// Email preferences, one row of switches in settings. They gate email only:
// everything still lands in the app, and someone with no account is always
// emailed because it's the only door they have. The digest switch writes the
// same column as the unsubscribe link in the email itself, so the two can't
// disagree.

export type NotifPrefs = {
  digest: boolean;
  messages: boolean;
  cancellations: boolean;
};

export async function notificationPrefs(): Promise<NotifPrefs | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const db = await getDb();
  const [me] = await db
    .select({
      digestOptOutAt: schema.users.digestOptOutAt,
      emailMessages: schema.users.emailMessages,
      emailCancellations: schema.users.emailCancellations,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me) return null;
  return {
    digest: !me.digestOptOutAt,
    messages: me.emailMessages,
    cancellations: me.emailCancellations,
  };
}

export async function setNotificationPref(
  key: "digest" | "messages" | "cancellations",
  on: boolean,
): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };
  const db = await getDb();
  const set =
    key === "digest"
      ? { digestOptOutAt: on ? null : new Date() }
      : key === "messages"
        ? { emailMessages: on }
        : { emailCancellations: on };
  await db.update(schema.users).set(set).where(eq(schema.users.id, userId));
  return { ok: true };
}
