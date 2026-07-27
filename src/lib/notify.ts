import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";

// The coach's in-app activity feed. Kept deliberately small: a row per event,
// unread until the coach opens the notifications screen.
export type NewNotification = {
  type: string;
  title: string;
  body?: string;
  href?: string | null;
};

export async function addNotification(userId: string, n: NewNotification): Promise<void> {
  const db = await getDb();
  await db.insert(schema.notifications).values({
    userId,
    type: n.type,
    title: n.title,
    body: n.body ?? "",
    href: n.href ?? null,
  });
}

export async function unreadNotifications(userId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
  return rows.length;
}

export async function listNotifications(userId: string, limit = 50) {
  const db = await getDb();
  return db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, userId))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit);
}

// Opening the notifications screen clears the unread badge.
export async function markNotificationsRead(userId: string): Promise<void> {
  const db = await getDb();
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
}
