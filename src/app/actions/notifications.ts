"use server";

import { revalidatePath } from "next/cache";
import { avatarColor } from "@/lib/avatar";
import { getSessionUserId } from "@/lib/session";
import { listNotifications, markNotificationsRead } from "@/lib/notify";

export async function loadNotificationSheet() {
  const userId = await getSessionUserId();
  if (!userId) return [];
  const notifications = (await listNotifications(userId, 50, ["message", "feedback"])).map(
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
  await markNotificationsRead(userId);
  revalidatePath("/", "layout");
  return notifications;
}

// Viewing Notifications is the "I've seen these" signal. Message threads keep
// their independent unread counts until the conversation itself opens.
export async function markUpdatesSeen(): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) return;
  await markNotificationsRead(userId);
  // The badge is in every header, so everything cached goes.
  revalidatePath("/", "layout");
}
