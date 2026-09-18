"use server";
import { and, eq, gt } from "drizzle-orm";
import { currentAdmin } from "@/lib/admin";
import { getDb, schema } from "@/db";
import { apnsConfigured } from "@/lib/apns";
import { queueNativePush } from "@/lib/native-push";
export async function adminTestPush() {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, message: "Admin access required." };
  if (!apnsConfigured()) return { ok: false, message: "Apple push credentials are not configured." };
  if ((process.env.APNS_ENVIRONMENT || "production") !== "production") return { ok: false, message: "TestFlight requires production APNs." };
  const db = await getDb();
  const devices = await db.select({ id: schema.nativePushDevices.id }).from(schema.nativePushDevices).where(and(eq(schema.nativePushDevices.userId, admin.id), gt(schema.nativePushDevices.expiresAt, new Date()), eq(schema.nativePushDevices.updates, true)));
  if (!devices.length) return { ok: false, message: "Enable On this iPhone notifications and Important updates in FittList first." };
  await queueNativePush([admin.id], { title: "FittList push test", body: "Notifications are connected. Tap to open your calendar.", url: "/calendar" }, "updates");
  return { ok: true, message: `Test queued for ${devices.length} of your registered devices. Check your iPhone; queued does not confirm Apple delivery.` };
}
