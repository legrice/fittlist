"use server";
import { and, eq, gt } from "drizzle-orm";
import { currentAdmin } from "@/lib/admin";
import { getDb, schema } from "@/db";
import { nativePushConfigured, queueNativePush } from "@/lib/native-push";
export async function adminTestPush(platform: "ios" | "android" = "ios") {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, message: "Admin access required." };
  if (!["ios", "android"].includes(platform) || !nativePushConfigured(platform)) return { ok: false, message: "Push credentials are not configured for this device type." };
  if (platform === "ios" && (process.env.APNS_ENVIRONMENT || "production") !== "production") return { ok: false, message: "TestFlight requires production APNs." };
  const db = await getDb();
  const devices = await db.select({ id: schema.nativePushDevices.id }).from(schema.nativePushDevices).where(and(eq(schema.nativePushDevices.userId, admin.id), gt(schema.nativePushDevices.expiresAt, new Date()), eq(schema.nativePushDevices.updates, true), eq(schema.nativePushDevices.platform, platform)));
  if (!devices.length) return { ok: false, message: "Enable On this device notifications and Important updates in FittList first." };
  await queueNativePush([admin.id], { title: "FittList push test", body: "Notifications are connected. Tap to open your calendar.", url: "/calendar" }, "updates", platform);
  return { ok: true, message: `Test queued for ${devices.length} of your registered devices. Check your device; queued does not confirm delivery.` };
}
