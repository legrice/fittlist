"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { appTheme, type AppTheme } from "@/lib/format";

export async function setTheme(theme: AppTheme): Promise<{ ok: boolean; theme?: AppTheme }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };
  const t = appTheme(theme);
  const db = await getDb();
  await db.update(schema.users).set({ theme: t }).where(eq(schema.users.id, userId));
  revalidatePath("/calendar");
  revalidatePath("/app/page");
  return { ok: true, theme: t };
}
