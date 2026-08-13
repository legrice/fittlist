"use server";

import { revalidatePath } from "next/cache";
import { getSessionUserId } from "@/lib/session";
import { markNotificationsRead } from "@/lib/notify";

// Viewing Notifications is the "I've seen these" signal. Message threads keep
// their independent unread counts until the conversation itself opens.
export async function markUpdatesSeen(): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) return;
  await markNotificationsRead(userId);
  // The badge is in every header, so everything cached goes.
  revalidatePath("/", "layout");
}
