"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { notifyAnnouncement } from "@/lib/notifier";

// A short pinned status on the coach's public page. Optionally broadcast to
// their subscriber list — the email goes out after the response so saving
// stays snappy.
export async function setAnnouncement(
  messageRaw: string,
  broadcast: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const message = messageRaw.trim().replace(/\s+/g, " ").slice(0, 160);
  if (message.length < 2) return { ok: false, error: "Type a short message." };

  const db = await getDb();
  const [user] = await db
    .update(schema.users)
    .set({ announcement: message, announcementAt: new Date() })
    .where(eq(schema.users.id, userId))
    .returning({ handle: schema.users.handle });

  if (broadcast) {
    after(() =>
      notifyAnnouncement(userId, message).catch((err) =>
        console.error("announcement broadcast failed", err),
      ),
    );
  }

  revalidatePath("/app");
  if (user?.handle) revalidatePath(`/${user.handle}`);
  return { ok: true };
}

export async function clearAnnouncement(): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const db = await getDb();
  const [user] = await db
    .update(schema.users)
    .set({ announcement: null, announcementAt: null })
    .where(eq(schema.users.id, userId))
    .returning({ handle: schema.users.handle });
  revalidatePath("/app");
  if (user?.handle) revalidatePath(`/${user.handle}`);
  return { ok: true };
}
