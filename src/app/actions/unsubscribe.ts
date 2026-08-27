"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { verifyDigestUnsubToken, verifyUnsubToken } from "@/lib/notifier";

function signedToken(formData: FormData): string | null {
  const value = formData.get("token");
  if (typeof value !== "string" || value.length > 4096 || !/^[A-Za-z0-9._-]+$/.test(value)) {
    return null;
  }
  return value;
}

/** Human-facing unsubscribe links land on a read-only page. Only its explicit
 * POST reaches this action; the signed token, not a bare email address, is the
 * authority for the mutation. */
export async function confirmSubscriberUnsubscribe(formData: FormData): Promise<void> {
  const token = signedToken(formData);
  if (!token) redirect("/");
  const subscriberId = await verifyUnsubToken(token);
  if (!subscriberId) redirect(`/u/${encodeURIComponent(token)}`);

  const db = await getDb();
  const [subscriber] = await db
    .select({ id: schema.subscribers.id, optedOutAt: schema.subscribers.optedOutAt })
    .from(schema.subscribers)
    .where(eq(schema.subscribers.id, subscriberId));
  if (subscriber && !subscriber.optedOutAt) {
    await db
      .update(schema.subscribers)
      .set({ optedOutAt: new Date() })
      .where(eq(schema.subscribers.id, subscriber.id));
  }
  redirect(`/u/${encodeURIComponent(token)}?done=1`);
}

/** The merged-digest token only controls email delivery. Confirming it never
 * changes the user's follows or authenticates the browser. */
export async function confirmDigestUnsubscribe(formData: FormData): Promise<void> {
  const token = signedToken(formData);
  if (!token) redirect("/");
  const userId = await verifyDigestUnsubToken(token);
  if (!userId) redirect(`/u/digest/${encodeURIComponent(token)}`);

  const db = await getDb();
  const [user] = await db
    .select({ id: schema.users.id, digestOptOutAt: schema.users.digestOptOutAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (user && !user.digestOptOutAt) {
    await db
      .update(schema.users)
      .set({ digestOptOutAt: new Date() })
      .where(eq(schema.users.id, user.id));
  }
  redirect(`/u/digest/${encodeURIComponent(token)}?done=1`);
}
