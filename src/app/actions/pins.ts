"use server";

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";

export async function toggleCalendarPin(entityType: "person" | "studio", entityId: string) {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false as const };
  const db = await getDb();
  const where = and(
    eq(schema.calendarPins.userId, userId),
    eq(schema.calendarPins.entityType, entityType),
    eq(schema.calendarPins.entityId, entityId),
  );
  const [existing] = await db.select({ id: schema.calendarPins.id }).from(schema.calendarPins).where(where);
  if (existing) {
    await db.delete(schema.calendarPins).where(where);
    return { ok: true as const, pinned: false };
  }
  await db.insert(schema.calendarPins).values({ userId, entityType, entityId }).onConflictDoNothing();
  return { ok: true as const, pinned: true };
}

export async function calendarPinState(entityType: "person" | "studio", entityId: string) {
  const userId = await getSessionUserId();
  if (!userId) return false;
  const db = await getDb();
  const [row] = await db.select({ id: schema.calendarPins.id }).from(schema.calendarPins).where(and(
    eq(schema.calendarPins.userId, userId),
    eq(schema.calendarPins.entityType, entityType),
    eq(schema.calendarPins.entityId, entityId),
  ));
  return !!row;
}
