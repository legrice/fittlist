"use server";

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentAdmin } from "@/lib/admin";

// Store this browser's push subscription. Admin-gated: the only thing pushes
// say today is "someone joined", which is nobody else's business. The
// subscription object comes straight from PushManager.subscribe on the client.
export async function savePushSubscription(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<{ ok: boolean; error?: string }> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth)
    return { ok: false, error: "That subscription didn't look right." };
  const db = await getDb();
  await db
    .insert(schema.pushSubscriptions)
    .values({ userId: admin.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
    .onConflictDoUpdate({
      target: schema.pushSubscriptions.endpoint,
      set: { userId: admin.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
  return { ok: true };
}

// This device is done being pinged. Scoped to the caller's own rows.
export async function removePushSubscription(
  endpoint: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  const db = await getDb();
  await db
    .delete(schema.pushSubscriptions)
    .where(
      and(
        eq(schema.pushSubscriptions.endpoint, endpoint),
        eq(schema.pushSubscriptions.userId, admin.id),
      ),
    );
  return { ok: true };
}
