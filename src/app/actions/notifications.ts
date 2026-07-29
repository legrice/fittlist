"use server";

import { revalidatePath } from "next/cache";
import { getSessionUserId } from "@/lib/session";
import { markNotificationsRead, unreadNotifications } from "@/lib/notify";

// Landing on Updates is the "I've seen these" signal. An action rather than a
// side effect of the page render, so the header badge on every cached page
// can be revalidated along with it.
export async function markUpdatesSeen(): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) return;
  const had = await unreadNotifications(userId);
  if (!had) return;
  await markNotificationsRead(userId);
  // The badge is in every header, so everything cached goes.
  revalidatePath("/", "layout");
}
