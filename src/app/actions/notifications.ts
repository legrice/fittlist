"use server";

import { revalidatePath } from "next/cache";
import { avatarColor } from "@/lib/avatar";
import { getSessionUserId } from "@/lib/session";
import { listNotifications, markNotificationsRead, type NotificationCursor } from "@/lib/notify";

export async function loadNotificationSheet(cursor?: NotificationCursor) {
  const userId = await getSessionUserId();
  if (!userId) return { notifications: [], nextCursor: null };
  if (cursor && (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.id) ||
    typeof cursor.createdAt !== "string" || !Number.isFinite(Date.parse(cursor.createdAt))
  )) throw new Error("Invalid notification page.");
  const rows = await listNotifications(userId, 51, ["message", "feedback"], cursor);
  const notifications = rows.slice(0, 50).map(
    (notification) => ({
      ...notification,
      actor: notification.actorId
        ? {
            name: notification.actorName ?? "",
            photo: notification.actorPhoto,
            color: avatarColor({
              id: notification.actorId,
              avatarColor: notification.actorColor,
            }),
            handle: notification.actorHandle,
          }
        : null,
    }),
  );
  const last = notifications.at(-1);
  return {
    notifications,
    nextCursor: rows.length > 50 && last ? { createdAt: last.createdAtCursor, id: last.id } : null,
  };
}

// Acknowledge the displayed rows after render. Message threads keep their
// independent unread counts until the conversation itself opens.
export async function markUpdatesSeen(notificationIds: string[]): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) return;
  if (!Array.isArray(notificationIds)) return;
  await markNotificationsRead(userId, notificationIds);
  // The badge is in every header, so everything cached goes.
  revalidatePath("/", "layout");
}

export async function hasNewNotifications(): Promise<boolean> {
  const { currentUser } = await import("@/lib/current-user");
  const { unreadHeaderCounts } = await import("@/lib/notify");
  const me = await currentUser();
  if (!me) return false;
  const counts = await unreadHeaderCounts(me.id, me.email);
  return counts.notifications > 0 || counts.messages > 0;
}
