import { and, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { after } from "next/server";
import { getDb, schema } from "@/db";
import { adminEmails } from "@/lib/admin";
import { apnsConfigured, sendApns, type PushPayload } from "@/lib/apns";

export type PushCategory = "follows" | "messages" | "adminActivity" | "updates";
export function deviceAllows(device: { follows: boolean; messages: boolean; adminActivity: boolean }, category: string) {
  return category === "updates" || (category === "follows" && device.follows) || (category === "messages" && device.messages) || (category === "adminActivity" && device.adminActivity);
}
export async function queueNativePush(userIds: string[], payload: PushPayload, category: PushCategory) {
  if (!apnsConfigured() || !userIds.length) return;
  const db = await getDb();
  const devices = await db.select().from(schema.nativePushDevices).where(and(inArray(schema.nativePushDevices.userId, userIds), gt(schema.nativePushDevices.expiresAt, new Date())));
  const rows = devices.filter(d => deviceAllows(d, category)).map(d => ({ deviceId: d.id, userId: d.userId, category, payload }));
  if (!rows.length) return;
  const queued = await db.insert(schema.nativePushDeliveries).values(rows).returning({ id: schema.nativePushDeliveries.id });
  // Durable rows precede the best-effort immediate send. Cron recovers work
  // after process interruption or a temporary Apple outage.
  try { after(async () => { await flushNativePush(queued.map(r => r.id)); }); }
  catch { /* Scripts and tests have no response lifetime; cron owns the queue. */ }
}
export async function flushNativePush(ids?: string[], deliver: typeof sendApns = sendApns) {
  if (!apnsConfigured()) return { configured: false, sent: 0, retried: 0 };
  const db = await getDb();
  const due = await db.select().from(schema.nativePushDeliveries).where(and(lte(schema.nativePushDeliveries.availableAt, new Date()), ids ? inArray(schema.nativePushDeliveries.id, ids) : undefined)).limit(20);
  let sent = 0, retried = 0;
  for (const row of due) {
    // An atomic lease prevents the response worker and cron from sending the
    // same row simultaneously. Expired leases are recoverable after a crash.
    const [claimed] = await db.update(schema.nativePushDeliveries).set({ availableAt: new Date(Date.now() + 120000), attempts: sql`${schema.nativePushDeliveries.attempts} + 1` })
      .where(and(eq(schema.nativePushDeliveries.id, row.id), lte(schema.nativePushDeliveries.availableAt, new Date()))).returning();
    if (!claimed) continue;
    const [target] = await db.select({ device: schema.nativePushDevices, version: schema.users.sessionVersion, email: schema.users.email }).from(schema.nativePushDevices)
      .innerJoin(schema.users, eq(schema.users.id, schema.nativePushDevices.userId)).where(eq(schema.nativePushDevices.id, row.deviceId));
    const discard = () => db.delete(schema.nativePushDeliveries).where(eq(schema.nativePushDeliveries.id, row.id));
    if (!target || target.device.userId !== row.userId || target.device.sessionVersion !== target.version || target.device.expiresAt <= new Date()
      || !deviceAllows(target.device, row.category) || (row.category === "adminActivity" && !adminEmails().includes(target.email.toLowerCase()))
      || Date.now() - row.createdAt.getTime() > 86400000) { await discard(); continue; }
    try {
      const result = await deliver(target.device.token, row.payload, row.id);
      if (result.status === 200) { await discard(); sent++; continue; }
      if (result.status === 410 || result.reason === "BadDeviceToken" || result.reason === "Unregistered") {
        await db.delete(schema.nativePushDevices).where(and(eq(schema.nativePushDevices.id, target.device.id), eq(schema.nativePushDevices.token, target.device.token))); continue;
      }
      console.error("native push provider rejected", { status: result.status });
    } catch { console.error("native push transport unavailable"); }
    if (claimed.attempts >= 8) await discard();
    else {
      await db.update(schema.nativePushDeliveries).set({ availableAt: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** (claimed.attempts - 1))) }).where(eq(schema.nativePushDeliveries.id, row.id));
      retried++;
    }
  }
  return { configured: true, sent, retried };
}
