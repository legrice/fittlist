"use server";

import { getSessionUserId } from "@/lib/session";
import { disconnectGoogle } from "@/lib/gcal";

export async function disconnectGoogleAction(): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };
  try {
    await disconnectGoogle(userId);
  } catch (err) {
    console.error("gcal disconnect failed", err);
  }
  return { ok: true };
}
