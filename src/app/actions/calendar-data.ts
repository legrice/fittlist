"use server";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentUser } from "@/lib/current-user";
import { todayIso } from "@/lib/format";
import { shareWeek } from "@/lib/shareweek";
import type { LastUsed, TemplateDto } from "@/lib/types";
import type { HubItem } from "@/components/ShareHubScreen";
import { avatarColor } from "@/lib/avatar";
import { classAddress, publicSchedules } from "@/lib/coachweek";
import { clockParts, occurrenceEnded, runsOn } from "@/lib/format";

export type FavoriteCalendarData = {
  people: { id:string; name:string; photo:string|null; color:string }[];
  events: { personId:string; classId:string; iso:string; name:string; where:string|null; hm:string; ap:string; base:string }[];
};

export async function loadFavoriteCalendars(): Promise<FavoriteCalendarData | null> {
  const me = await currentUser();
  if (!me) return null;
  const db = await getDb();
  const favoriteRows = await db.select({ id:schema.subscribers.trainerUserId }).from(schema.subscribers).where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt)));
  const ids = [...new Set(favoriteRows.map((row) => row.id))].filter((id) => id !== me.id);
  if (!ids.length) return { people:[], events:[] };
  const peopleRows = await db.select().from(schema.users).where(inArray(schema.users.id, ids));
  const scheduleRows = await publicSchedules(peopleRows);
  const studioIds = [...new Set(scheduleRows.map((row) => row.studioId).filter((id):id is string => !!id))];
  const studios = studioIds.length ? await db.select({ id:schema.studios.id, name:schema.studios.name, slug:schema.studios.slug }).from(schema.studios).where(inArray(schema.studios.id, studioIds)) : [];
  const studioById = new Map(studios.map((studio) => [studio.id, studio]));
  const personById = new Map(peopleRows.map((person) => [person.id, person]));
  const events:FavoriteCalendarData["events"] = [];
  const start = Date.parse(`${todayIso()}T00:00:00Z`);
  for (let offset=0; offset<56; offset++) {
    const iso = new Date(start + offset*864e5).toISOString().slice(0,10);
    const dow = (new Date(`${iso}T00:00:00Z`).getUTCDay()+6)%7;
    for (const row of scheduleRows) {
      if (!runsOn(row,iso,dow) || occurrenceEnded(iso,row.startTime,row.durationMin)) continue;
      const person = personById.get(row.ownerUserId);
      if (!person?.handle) continue;
      const studio = row.studioId ? studioById.get(row.studioId) : null;
      const address = classAddress(row,person.handle,studio?.slug);
      if (!address) continue;
      const time = clockParts(row.startTime);
      events.push({ personId:person.id, classId:row.id, iso, name:row.name, where:studio?.name ?? row.location, hm:time.hm, ap:time.ap, base:address.base });
    }
  }
  const activeIds = new Set(events.map((event) => event.personId));
  return {
    people: peopleRows.filter((person) => activeIds.has(person.id)).map((person) => ({ id:person.id, name:person.name.trim() || "Favorite", photo:person.photoThumb ?? person.photo, color:avatarColor(person) })),
    events,
  };
}

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
