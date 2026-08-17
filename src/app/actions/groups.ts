"use server";

import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { clockParts, todayIso } from "@/lib/format";

export type GroupClassChoice = { classId: string; iso: string; name: string; detail: string };

export async function groupClassOptions(): Promise<GroupClassChoice[]> {
  const userId = await getSessionUserId();
  if (!userId) return [];
  const db = await getDb();
  const marks = await db
    .select({ classId: schema.attendances.classId, iso: schema.attendances.occurrenceDate })
    .from(schema.attendances)
    .where(and(eq(schema.attendances.userId, userId), gte(schema.attendances.occurrenceDate, todayIso())));
  if (!marks.length) return [];
  const classes = await db.select().from(schema.classes).where(inArray(schema.classes.id, [...new Set(marks.map((mark) => mark.classId))]));
  const byId = new Map(classes.map((item) => [item.id, item]));
  return marks.flatMap((mark) => {
    const item = byId.get(mark.classId);
    if (!item) return [];
    const date = new Date(`${mark.iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    const time = clockParts(item.startTime);
    return [{ classId: mark.classId, iso: mark.iso, name: item.name, detail: `${date} · ${time.hm} ${time.ap}` }];
  });
}

export async function createGroup(input: { name: string; description?: string; memberIds: string[]; classes?: { classId: string; iso: string }[] }) {
  const ownerUserId = await getSessionUserId();
  if (!ownerUserId) return { ok: false, error: "Sign in to create a group." } as const;
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) return { ok: false, error: "Give your group a name." } as const;
  if (name.length > 60) return { ok: false, error: "Keep the name under 60 characters." } as const;
  const description = input.description?.trim().replace(/\s+/g, " ") || null;
  if (description && description.length > 280) return { ok: false, error: "Keep the description under 280 characters." } as const;

  const db = await getDb();
  const [owner] = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, ownerUserId));
  if (!owner) return { ok: false, error: "Account not found." } as const;
  const requestedIds = [...new Set(input.memberIds)].filter((id) => id !== ownerUserId).slice(0, 30);
  const allowedIds = requestedIds.length
    ? (await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .innerJoin(schema.subscribers, eq(schema.subscribers.trainerUserId, schema.users.id))
        .where(and(eq(schema.subscribers.email, owner.email), isNull(schema.subscribers.optedOutAt), inArray(schema.users.id, requestedIds))))
        .map((row) => row.id)
    : [];
  const requestedClasses = [...new Map((input.classes ?? []).filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.iso)).map((item) => [`${item.classId}|${item.iso}`, item])).values()].slice(0, 30);
  const allowedClassKeys = requestedClasses.length
    ? new Set((await db.select({ classId: schema.attendances.classId, iso: schema.attendances.occurrenceDate }).from(schema.attendances).where(and(eq(schema.attendances.userId, ownerUserId), inArray(schema.attendances.classId, requestedClasses.map((item) => item.classId))))).map((row) => `${row.classId}|${row.iso}`))
    : new Set<string>();
  const allowedClasses = requestedClasses.filter((item) => allowedClassKeys.has(`${item.classId}|${item.iso}`));

  const group = await db.transaction(async (tx) => {
    const [created] = await tx.insert(schema.groups).values({ name, description, ownerUserId }).returning({ id: schema.groups.id });
    await tx.insert(schema.groupMembers).values([
      { groupId: created.id, userId: ownerUserId },
      ...allowedIds.map((userId) => ({ groupId: created.id, userId })),
    ]);
    if (allowedClasses.length) await tx.insert(schema.groupClasses).values(allowedClasses.map((item) => ({ groupId: created.id, classId: item.classId, occurrenceDate: item.iso })));
    return created;
  });
  revalidatePath("/saved");
  return { ok: true, id: group.id } as const;
}
