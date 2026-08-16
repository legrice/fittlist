"use server";

import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import type { LastUsed, StudioDto, TemplateDto } from "@/lib/types";

export async function globalComposerData(): Promise<{
  studios: StudioDto[];
  templates: TemplateDto[];
  customTypes: string[];
  lastUsed: LastUsed;
  canCoach: boolean;
  groups: { id: string; name: string }[];
  teaching: { seriesId: string; name: string; where: string; days: number[]; startTime: string }[];
} | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const db = await getDb();
  const [me, studios, rows, custom, memberships, teachingRows] = await Promise.all([
    db.select({ kind: schema.users.kind, handle: schema.users.handle }).from(schema.users).where(eq(schema.users.id, userId)).then((r) => r[0]),
    db.select().from(schema.studios).orderBy(schema.studios.seq),
    db.select().from(schema.classTemplates).where(eq(schema.classTemplates.userId, userId)).orderBy(desc(schema.classTemplates.updatedAt)),
    db.select({ name: schema.customClassTypes.name }).from(schema.customClassTypes),
    db.select({ id: schema.groups.id, name: schema.groups.name })
      .from(schema.groupMembers)
      .innerJoin(schema.groups, eq(schema.groups.id, schema.groupMembers.groupId))
      .where(eq(schema.groupMembers.userId, userId)),
    db.select().from(schema.classes).where(eq(schema.classes.userId, userId)),
  ]);
  const studioDtos = studios.map((s) => ({ id: s.id, seq: s.seq, slug: s.slug, name: s.name, address: s.address }));
  const templates = rows.map((t) => ({ name: t.name, classType: t.classType, description: t.description, image: t.image, startTime: t.startTime, durationMin: t.durationMin, studioId: t.studioId, location: t.location, withWho: t.withWho, isPublic: t.isPublic, links: t.links }));
  const studioName = new Map(studios.map((studio) => [studio.id, studio.name]));
  const teachingBySeries = new Map<string, { seriesId: string; name: string; where: string; days: number[]; startTime: string }>();
  for (const row of teachingRows) {
    const current = teachingBySeries.get(row.seriesId) ?? {
      seriesId: row.seriesId,
      name: row.name,
      where: (row.studioId && studioName.get(row.studioId)) || row.location || "",
      days: [],
      startTime: row.startTime,
    };
    if (!current.days.includes(row.dayOfWeek)) current.days.push(row.dayOfWeek);
    teachingBySeries.set(row.seriesId, current);
  }
  return {
    studios: studioDtos,
    templates,
    customTypes: custom.map((r) => r.name),
    lastUsed: templates.length ? { startTime: templates[0].startTime, durationMin: templates[0].durationMin, studioId: templates[0].studioId } : { startTime: "06:00", durationMin: 50, studioId: studioDtos[0]?.id ?? null },
    canCoach: !!me && me.kind !== "fan" && !!me.handle,
    groups: memberships,
    teaching: [...teachingBySeries.values()],
  };
}
