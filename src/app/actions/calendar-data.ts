"use server";

import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentUser } from "@/lib/current-user";
import { todayIso } from "@/lib/format";
import { shareWeek } from "@/lib/shareweek";
import type { LastUsed, TemplateDto } from "@/lib/types";
import type { HubItem } from "@/components/ShareHubScreen";

export type CalendarComposerData = {
  templates: TemplateDto[];
  customTypes: string[];
  lastUsed: LastUsed;
  subsCount: number;
};

export async function loadCalendarComposerData(): Promise<CalendarComposerData | null> {
  const me = await currentUser();
  if (!me) return null;
  const db = await getDb();
  const [templateRows, customTypeRows, subRows, firstStudio] = await Promise.all([
    db.select().from(schema.classTemplates).where(eq(schema.classTemplates.userId, me.id)).orderBy(desc(schema.classTemplates.updatedAt)),
    db.select({ name: schema.customClassTypes.name }).from(schema.customClassTypes),
    db.select({ id: schema.subscribers.id }).from(schema.subscribers).where(eq(schema.subscribers.trainerUserId, me.id)),
    db.select({ id: schema.studios.id }).from(schema.studios).orderBy(schema.studios.seq).limit(1),
  ]);
  const templates: TemplateDto[] = templateRows.map((template) => ({
    name: template.name,
    classType: template.classType,
    description: template.description,
    image: template.image,
    startTime: template.startTime,
    durationMin: template.durationMin,
    studioId: template.studioId,
    location: template.location,
    withWho: template.withWho,
    isPublic: template.isPublic,
    links: template.links,
  }));
  return {
    templates,
    customTypes: customTypeRows.map((row) => row.name),
    lastUsed: templates.length
      ? { startTime: templates[0].startTime, durationMin: templates[0].durationMin, studioId: templates[0].studioId }
      : { startTime: "06:00", durationMin: 50, studioId: firstStudio[0]?.id ?? null },
    subsCount: subRows.length,
  };
}

export async function loadCalendarShareData(): Promise<{ items: HubItem[]; defaultFrom: string; savedHeadline: string } | null> {
  const me = await currentUser();
  if (!me) return null;
  const today = todayIso();
  const days = await shareWeek(me.id, today, 14);
  return {
    items: days.flatMap((day) => day.items.map((item) => ({ key:item.key, iso:item.iso, time:item.time, name:item.name, where:item.where, own:item.own, coaching:item.coaching }))),
    defaultFrom: days[0]?.iso ?? today,
    savedHeadline: me.storyPrefs?.headline ?? "",
  };
}
