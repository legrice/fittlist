import { eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { getDb, schema } from "@/db";
import { queueNativePush, type PushCategory } from "@/lib/native-push";
import { apnsConfigured } from "@/lib/apns";
import { adminEmails } from "@/lib/admin";

// Browser subscriptions use VAPID; installed iOS devices use APNs.
export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function configured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

// Provider errors can contain bearer endpoints, headers, and payload contents.
// Keep only a bounded HTTP status in operational logs.
function failureStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return null;
  const status = error.statusCode;
  return typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

/** Send a push to one account on every device it has registered. */
export async function pushToUser(userId: string, payload: {
  title: string;
  body: string;
  url: string;
}, category: PushCategory = "updates"): Promise<void> {
  await queueNativePush([userId], payload, category);
  if (!configured()) return;
  webpush.setVapidDetails(
    `mailto:${process.env.MAIL_REPLY_TO || "hello@fittlist.co"}`,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  const db = await getDb();
  const subs = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.userId, userId));
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 24, timeout: 10000 },
      );
    } catch (err: unknown) {
      const code = failureStatus(err);
      if (code === 404 || code === 410)
        await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, s.endpoint));
      else console.error("push failed", { statusCode: code });
    }
  }));
}

/** Send to every subscribed admin device. Dead subscriptions (the browser
 *  revoked or the app was uninstalled) come back 404/410 and are pruned, so
 *  the table can't fill with ghosts. Failures never propagate: a push is a
 *  nicety, and signup must not care whether it landed. */
export async function pushToAdmins(payload: {
  title: string;
  body: string;
  url: string;
}): Promise<void> {
  const emails = adminEmails();
  if (!configured() && !apnsConfigured()) return;
  const db = await getDb();
  if (!emails.length) return;
  const admins = await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users);
  const adminIds = admins.filter(u => emails.includes(u.email.toLowerCase())).map(u => u.id);
  if (!adminIds.length) return;
  await queueNativePush(adminIds, payload, "adminActivity");
  if (!configured()) return;
  webpush.setVapidDetails(
    `mailto:${process.env.MAIL_REPLY_TO || "hello@fittlist.co"}`,
    process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!,
  );
  const subs = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(inArray(schema.pushSubscriptions.userId, adminIds));
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24, timeout: 10000 },
        );
      } catch (err: unknown) {
        const code = failureStatus(err);
        if (code === 404 || code === 410) {
          await db
            .delete(schema.pushSubscriptions)
            .where(eq(schema.pushSubscriptions.endpoint, s.endpoint));
        } else {
          console.error("push failed", { statusCode: code });
        }
      }
    }),
  );
}

/** A fresh account, from any of the four sign-in methods. Just
 *  the email: the name and the coach/member choice both land later in
 *  onboarding, and the admin People tab has the rest one tap away. */
export async function pushSignupPing(email: string): Promise<void> {
  try {
    await pushToAdmins({
      title: "New on fittlist",
      body: `${email} just signed up.`,
      url: "/admin",
    });
  } catch (err) {
    console.error("signup ping failed", { statusCode: failureStatus(err) });
  }
}
