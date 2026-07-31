import { eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { getDb, schema } from "@/db";
import { adminEmails } from "@/lib/admin";

// Web push, one job: ping the admin's phone when someone new joins. The VAPID
// pair lives in env (generate once with `npx web-push generate-vapid-keys`);
// without it the whole feature quietly sits out, the toggle included.
export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function configured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
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
  if (!configured()) return;
  webpush.setVapidDetails(
    `mailto:${process.env.MAIL_REPLY_TO || "hello@fittlist.co"}`,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  const db = await getDb();
  const admins = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users);
  const adminIds = admins.filter((u) => adminEmails().includes(u.email.toLowerCase())).map((u) => u.id);
  if (!adminIds.length) return;
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
          { TTL: 60 * 60 * 24 },
        );
      } catch (err: unknown) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await db
            .delete(schema.pushSubscriptions)
            .where(eq(schema.pushSubscriptions.endpoint, s.endpoint));
        } else {
          console.error("push failed", s.endpoint.slice(0, 48), err);
        }
      }
    }),
  );
}

/** The one caller today: a fresh account, from any of the four doors. Just
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
    console.error("signup ping failed", err);
  }
}
