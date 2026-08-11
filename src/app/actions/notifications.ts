"use server";

import { revalidatePath } from "next/cache";
import { getSessionUserId } from "@/lib/session";
import { markNotificationsRead, unreadNotifications } from "@/lib/notify";

// Viewing Updates' Notifications segment is the "I've seen these" signal.
// Message threads keep their own unread counts until the conversation opens.
export async function markUpdatesSeen(): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) return;
  const had = await unreadNotifications(userId);
  if (!had) return;
  await markNotificationsRead(userId);
  // The badge is in every header, so everything cached goes.
  revalidatePath("/", "layout");
}
