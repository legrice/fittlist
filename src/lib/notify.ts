import { and, count, desc, eq, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/db";

// The coach's in-app activity feed. Kept deliberately small: a row per event,
// unread until the coach opens the notifications screen.
export type NewNotification = {
  type: string;
  title: string;
  body?: string;
  href?: string | null;
  /** Who it's about, when it's a person doing something. The row shows their
   *  face, so "New follower" is a face rather than a generic badge. */
  actorUserId?: string | null;
};

export async function addNotification(userId: string, n: NewNotification): Promise<void> {
  const db = await getDb();
  await db.insert(schema.notifications).values({
    userId,
    type: n.type,
    title: n.title,
    body: n.body ?? "",
    href: n.href ?? null,
    actorUserId: n.actorUserId ?? null,
  });
}

export async function unreadNotifications(userId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ n: count() })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
  return Number(rows[0]?.n ?? 0);
}

/** Independent header counts for the two attention doors. Message
 * notification rows duplicate thread unread state, so Notifications excludes
 * them and Messages counts the thread itself. */
export async function unreadHeaderCounts(
  userId: string,
  email: string,
): Promise<{ notifications: number; messages: number }> {
  const db = await getDb();
  const normalizedEmail = email.trim().toLowerCase();
  const [notifications, threads] = await Promise.all([
    db
      .select({ n: count() })
      .from(schema.notifications)
      .where(and(
        eq(schema.notifications.userId, userId),
        isNull(schema.notifications.readAt),
        notInArray(schema.notifications.type, ["message", "feedback"]),
      )),
    db
      .select({
        n: sql<number>`coalesce(sum(case when ${schema.inquiryThreads.coachUserId} = ${userId} then ${schema.inquiryThreads.coachUnread} else ${schema.inquiryThreads.requesterUnread} end), 0)`,
      })
      .from(schema.inquiryThreads)
      .where(
        or(
          eq(schema.inquiryThreads.coachUserId, userId),
          and(
            eq(schema.inquiryThreads.requesterEmail, normalizedEmail),
            eq(schema.inquiryThreads.kind, "inquiry"),
          ),
        ),
      ),
  ]);

  return {
    notifications: Number(notifications[0]?.n ?? 0),
    messages: Number(threads[0]?.n ?? 0),
  };
}

/** One badge for the combined Updates surface.
 *
 * Message events are stored both as notification rows and as unread counts on
 * their threads. Count the thread, not its duplicate notification, so one new
 * message never appears as two updates. Feedback replies stay notifications:
 * the member reads those in the dedicated feedback room rather than Messages.
 */
export async function unreadUpdateCount(userId: string, email: string): Promise<number> {
  const counts = await unreadHeaderCounts(userId, email);
  return counts.notifications + counts.messages;
}

export type NotificationCursor = { createdAt: string; id: string };

export async function listNotifications(userId: string, limit = 50, excludeTypes: string[] = [], cursor?: NotificationCursor) {
  const db = await getDb();
  // Left join: an email subscriber has no account, and the row still shows.
  const actor = alias(schema.users, "actor");
  return db
    .select({
      id: schema.notifications.id,
      type: schema.notifications.type,
      title: schema.notifications.title,
      body: schema.notifications.body,
      href: schema.notifications.href,
      readAt: schema.notifications.readAt,
      createdAt: schema.notifications.createdAt,
      // Preserve PostgreSQL's microseconds for paging; JS Date rounds these
      // away and can otherwise skip notifications created in the same ms.
      createdAtCursor: sql<string>`${schema.notifications.createdAt}::text`,
      actorId: actor.id,
      actorName: actor.name,
      actorPhoto: actor.photo,
      actorColor: actor.avatarColor,
      actorHandle: actor.handle,
    })
    .from(schema.notifications)
    .leftJoin(actor, eq(actor.id, schema.notifications.actorUserId))
    .where(
      and(
        eq(schema.notifications.userId, userId),
        excludeTypes.length ? notInArray(schema.notifications.type, excludeTypes) : undefined,
        cursor ? or(
          lt(schema.notifications.createdAt, sql`${cursor.createdAt}::timestamptz`),
          and(eq(schema.notifications.createdAt, sql`${cursor.createdAt}::timestamptz`), lt(schema.notifications.id, cursor.id)),
        ) : undefined,
      ),
    )
    .orderBy(desc(schema.notifications.createdAt), desc(schema.notifications.id))
    .limit(limit);
}

// Only acknowledge rows actually displayed. A failed load, a 50-row limit,
// or a notification arriving during the request must not clear unseen updates.
export async function markNotificationsRead(userId: string, notificationIds: string[]): Promise<void> {
  const ids = [...new Set(notificationIds)].filter((id) =>
    typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
  ).slice(0, 50);
  if (!ids.length) return;
  const db = await getDb();
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.userId, userId),
        inArray(schema.notifications.id, ids),
        isNull(schema.notifications.readAt),
        notInArray(schema.notifications.type, ["message", "feedback"]),
      ),
    );
}
