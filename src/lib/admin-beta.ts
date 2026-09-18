import { count, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { adminEmails, currentAdmin } from "@/lib/admin";
import { betaAnalytics } from "@/lib/beta-analytics";
import { apnsConfigured } from "@/lib/apns";
import { fcmConfigured } from "@/lib/fcm";
export async function adminBetaAnalytics() {
  if (!await currentAdmin()) throw new Error("Admin access required");
  const db = await getDb();
  const now = new Date();
  const [people, events, invites, devices, queue] = await Promise.all([
    db.select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, kind: schema.users.kind, createdAt: schema.users.createdAt, onboardedAt: schema.users.onboardedAt, signupSource: schema.users.signupSource }).from(schema.users),
    db.select({ actorUserId: schema.productActivity.actorUserId, kind: schema.productActivity.kind, createdAt: schema.productActivity.createdAt }).from(schema.productActivity).where(gte(schema.productActivity.createdAt, new Date(now.getTime() - 56 * 86400000))),
    db.select({ email: schema.invites.email, createdAt: schema.invites.createdAt, acceptedAt: schema.invites.acceptedAt }).from(schema.invites).where(gte(schema.invites.createdAt, new Date(now.getTime() - 28 * 86400000))),
    db.select({ count: sql<number>`count(*) filter (where ${schema.nativePushDevices.platform} = 'ios')::int`, android: sql<number>`count(*) filter (where ${schema.nativePushDevices.platform} = 'android')::int` }).from(schema.nativePushDevices).where(gte(schema.nativePushDevices.expiresAt, now)),
    db.select({ count: count(), retrying: sql<number>`count(*) filter (where ${schema.nativePushDeliveries.attempts} > 0)::int`, oldest: sql<Date | null>`min(${schema.nativePushDeliveries.createdAt})` }).from(schema.nativePushDeliveries),
  ]);
  const excluded = [...adminEmails(), ...(process.env.ANALYTICS_EXCLUDED_EMAILS || "").split(","), "review@fittlist.co"].map(email => email.trim().toLowerCase());
  const periods = [7, 28].map(days => {
    const rows = invites.filter(invite => !excluded.includes(invite.email.toLowerCase()) && invite.createdAt.getTime() >= now.getTime() - days * 86400000);
    return { ...betaAnalytics(people, events, excluded, now, days), invites: { sent: rows.length, accepted: rows.filter(row => row.acceptedAt).length } };
  });
  return { periods, androidPush: {configured:fcmConfigured(), devices:Number(devices[0]?.android || 0), missing:["FCM_PROJECT_ID", "FCM_CLIENT_EMAIL", "FCM_PRIVATE_KEY"].filter(key=>!process.env[key])}, push: {
    configured: apnsConfigured(), missing: ["APNS_KEY_ID", "APNS_TEAM_ID", "APNS_PRIVATE_KEY", "CRON_SECRET"].filter(key => !process.env[key]),
    production: (process.env.APNS_ENVIRONMENT || "production") === "production",
    devices: Number(devices[0]?.count || 0), queued: Number(queue[0]?.count || 0), retrying: Number(queue[0]?.retrying || 0),
    oldest: queue[0]?.oldest ? new Date(queue[0].oldest).toISOString() : null,
  } };
}
export type AdminBetaData = Awaited<ReturnType<typeof adminBetaAnalytics>>;
