"use server";

import { calendarToken } from "@/lib/calfeed";
import { getSessionUserId } from "@/lib/session";

// Minted on demand rather than stored: the token is a signature over the user
// id, so it's the same string every time and there's nothing to keep in sync.
export async function myCalendarUrl(): Promise<string | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return `/api/cal/me/${await calendarToken(userId)}`;
}
