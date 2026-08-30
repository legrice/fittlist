"use server";

import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentUser } from "@/lib/current-user";
import { todayIso } from "@/lib/format";
import { shareWeek } from "@/lib/shareweek";
import type { ClassDto, LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import type { HubItem } from "@/components/ShareHubScreen";
import type { WeekDay } from "@/lib/week";
import { myWeek } from "@/lib/week";
import { mySchedule } from "@/lib/coachweek";
import { avatarColor } from "@/lib/avatar";
import { getSessionUserId } from "@/lib/session";

export type PersonalCalendarData = {
  handle: string | null;
  viewer: { id: string; name: string; photo: string | null; color: string };
  classes: ClassDto[];
  todayIso: string;
  studios: StudioDto[];
  savedDays: WeekDay[];
  member: boolean;
};

export async function loadPersonalCalendarData(): Promise<PersonalCalendarData | null> {
  const me = await currentUser();
  if (!me) return null;
  const db = await getDb();
  const [classRows, studioRows, savedDays] = await Promise.all([
    mySchedule(me.id),
    db.select({ id:schema.studios.id, seq:schema.studios.seq, slug:schema.studios.slug, name:schema.studios.name, address:schema.studios.address }).from(schema.studios).orderBy(schema.studios.seq),
    myWeek(me.id, { email:me.email }),
  ]);
  const studioById = new Map(studioRows.map((studio) => [studio.id, studio]));
  return {
    handle: me.handle,
    viewer: { id:me.id, name:me.name, photo:me.photoThumb ?? me.photo, color:avatarColor(me) },
    classes: classRows.map((row) => ({
      id:row.id, templateId:row.templateId, seriesId:row.seriesId, dayOfWeek:row.dayOfWeek,
      specificDate:row.specificDate, endsOn:row.endsOn, skipDates:row.skipDates,
      startTime:row.startTime, timeZone:row.timeZone, durationMin:row.durationMin,
      name:row.name, classType:row.classType, description:row.description,
      studioId:row.studioId, location:row.location, isPublic:row.isPublic, links:row.links,
      shift:row.shift, shiftBase:row.shift && row.studioId ? studioById.get(row.studioId)?.slug ?? null : null,
      duplicateOf:row.duplicateOf,
    })),
    todayIso: todayIso(),
    studios: studioRows,
    savedDays,
    member: me.kind === "fan",
  };
}

export type CalendarComposerData = {
  studios: StudioDto[];
  templates: TemplateDto[];
  customTypes: string[];
  lastUsed: LastUsed;
  subsCount: number;
};

export async function loadCalendarComposerData(includeSubscriberCount = true): Promise<CalendarComposerData | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const db = await getDb();
  const [studioRows, templateRows, customTypeRows, subRows] = await Promise.all([
    db
      .select({
        id: schema.studios.id,
        seq: schema.studios.seq,
        slug: schema.studios.slug,
        name: schema.studios.name,
        address: schema.studios.address,
      })
      .from(schema.studios)
      .orderBy(schema.studios.seq),
    db.select().from(schema.classTemplates).where(eq(schema.classTemplates.userId, userId)).orderBy(desc(schema.classTemplates.updatedAt)),
    db.select({ name: schema.customClassTypes.name }).from(schema.customClassTypes),
    includeSubscriberCount
      ? db.select({ id: schema.subscribers.id }).from(schema.subscribers).where(eq(schema.subscribers.trainerUserId, userId))
      : Promise.resolve([]),
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
    studios: studioRows,
    templates,
    customTypes: customTypeRows.map((row) => row.name),
    lastUsed: templates.length
      ? { startTime: templates[0].startTime, durationMin: templates[0].durationMin, studioId: templates[0].studioId }
      : { startTime: "06:00", durationMin: 50, studioId: studioRows[0]?.id ?? null },
    subsCount: subRows.length,
  };
}

export async function loadCalendarShareData(): Promise<{ items: HubItem[]; defaultFrom: string; savedHeadline: string; hasBackground:boolean; initialRevision:number } | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const db = await getDb();
  const today = todayIso();
  const [userRows, days] = await Promise.all([
    db
      .select({
        headline: sql<string | null>`${schema.users.storyPrefs}->>'headline'`,
        hasBackground: sql<boolean>`coalesce(${schema.users.storyPrefs} ? 'background', false)`,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId)),
    shareWeek(userId, today, 14),
  ]);
  const [me] = userRows;
  if (!me) return null;
  return {
    items: days.flatMap((day) => day.items.map((item) => ({ key:item.key, iso:item.iso, time:item.time, name:item.name, where:item.where, own:item.own, coaching:item.coaching }))),
    defaultFrom: days[0]?.iso ?? today,
    savedHeadline: me.headline ?? "",
    hasBackground: me.hasBackground,
    initialRevision: Date.now(),
  };
}
