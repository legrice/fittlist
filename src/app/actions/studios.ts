"use server";

import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";

export type StudioDto = { id: string; seq: number; name: string; address: string };

export async function createStudio(
  nameRaw: string,
  addressRaw: string,
): Promise<{ ok: boolean; studio?: StudioDto; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const name = nameRaw.trim();
  const address = addressRaw.trim();
  if (!name) return { ok: false, error: "Enter the studio name." };
  if (!address) return { ok: false, error: "Enter the address." };
  const db = await getDb();
  const [studio] = await db
    .insert(schema.studios)
    .values({ name, address, createdByUserId: userId })
    .returning();
  return {
    ok: true,
    studio: { id: studio.id, seq: studio.seq, name: studio.name, address: studio.address },
  };
}
