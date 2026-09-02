import { redirect } from "next/navigation";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { mySchedule } from "@/lib/coachweek";
import { clockParts, dayBandLabel, todayIso } from "@/lib/format";
import type { ClassDto, StudioDto } from "@/lib/types";
import { CalendarScreen } from "@/components/CalendarScreen";
import { myWeek } from "@/lib/week";
import { avatarColor } from "@/lib/avatar";
import { currentUser } from "@/lib/current-user";
import { managedCalendarsForUser } from "@/lib/managed-calendars";
import { gymSchedule } from "@/app/actions/gym";
import type { WeekDayRows } from "@/components/WeekView";

export const dynamic = "force-dynamic";

/**
 * The Calendar tab: a coach's own week.
 *
 * It lives in the tabs group now, which is the whole point of the move. It was
 * `/app`, its own route with its own copy of the header and the bar, because
 * for a long time a coach and a member were two different apps wearing two
 * different shells. There is one account shape and one shell; a coach is
 * somebody whose `kind` is not "fan", and all that buys them is this tab.
 *
 * `/app` still resolves and lands here, because it is the installed app's
 * `start_url` and is in every bookmark a beta coach has.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string; hl?: string }>;
}) {
  // `?add=1` opens the adder on arrival. It is /app's old parameter, carried
  // through its redirect, and it is what "Add a class" links out in the world
  // still say.
  const { add, hl } = await searchParams;
  const me = await currentUser();
  if (!me) redirect("/");
  const userId = me.id;
  const db = await getDb();
  const member = me.kind === "fan";
  const today = todayIso();

  const [classRows, studioRows, savedDays, managedCalendars] = await Promise.all([
    // The same loader the coach shell used: their own classes with the gym
    // shifts folded in, because a coach who is on Thursday at seven has to be
    // able to see that they are on Thursday at seven.
    mySchedule(userId),
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
    myWeek(userId, { email: me.email }),
    managedCalendarsForUser(userId),
  ]);

  const studioById = new Map(studioRows.map((st) => [st.id, st]));
  const classes: ClassDto[] = classRows.map((c) => ({
    id: c.id,
    templateId: c.templateId,
    seriesId: c.seriesId,
    dayOfWeek: c.dayOfWeek,
    specificDate: c.specificDate,
    endsOn: c.endsOn,
    skipDates: c.skipDates,
    startTime: c.startTime,
    timeZone: c.timeZone,
    durationMin: c.durationMin,
    name: c.name,
    classType: c.classType,
    description: c.description,
    studioId: c.studioId,
    location: c.location,
    isPublic: c.isPublic,
    links: c.links,
    shift: c.shift,
    shiftBase: c.shift && c.studioId ? studioById.get(c.studioId)?.slug ?? null : null,
    duplicateOf: c.duplicateOf,
  }));

  const studios: StudioDto[] = studioRows.map((s) => ({
    id: s.id,
    seq: s.seq,
    slug: s.slug,
    name: s.name,
    address: s.address,
  }));
  const groupIds = managedCalendars.filter((calendar) => calendar.kind === "group").map((calendar) => calendar.id);
  const groupThroughDate = new Date(`${today}T00:00:00Z`);
  groupThroughDate.setUTCDate(groupThroughDate.getUTCDate() + 56);
  const groupRows = groupIds.length ? await db.select({
    groupId:schema.groupClasses.groupId,
    classId:schema.classes.id,
    iso:schema.groupClasses.occurrenceDate,
    name:schema.classes.name,
    startTime:schema.classes.startTime,
    durationMin:schema.classes.durationMin,
    location:schema.classes.location,
    studioName:schema.studios.name,
    coachId:schema.users.id,
    coachName:schema.users.name,
    coachPhoto:sql<string | null>`coalesce(${schema.users.photoThumb}, ${schema.users.photo})`,
    coachColor:schema.users.avatarColor,
  }).from(schema.groupClasses)
    .innerJoin(schema.classes, eq(schema.classes.id, schema.groupClasses.classId))
    .leftJoin(schema.studios, eq(schema.studios.id, schema.classes.studioId))
    .leftJoin(schema.users, eq(schema.users.id, schema.classes.userId))
    .where(and(inArray(schema.groupClasses.groupId, groupIds), gte(schema.groupClasses.occurrenceDate, today), lte(schema.groupClasses.occurrenceDate, groupThroughDate.toISOString().slice(0,10)))) : [];
  const managedCalendarViews = await Promise.all(managedCalendars.map(async (calendar) => {
    if (calendar.kind === "group") {
      const byDay = new Map<string, WeekDayRows["rows"]>();
      for (const item of groupRows.filter((row) => row.groupId === calendar.id)) {
        const time = clockParts(item.startTime);
        const rows = byDay.get(item.iso) ?? [];
        rows.push({ key:`${calendar.id}|${item.classId}|${item.iso}`, classId:item.classId, iso:item.iso, name:item.name, where:item.studioName ?? item.location, hm:time.hm, ap:time.ap, dur:`${item.durationMin} min`, coach:item.coachId ? { id:item.coachId, name:item.coachName ?? "Coach", photo:item.coachPhoto, color:avatarColor({ id:item.coachId, avatarColor:item.coachColor }) } : null, tag:"Group", tagTone:"attending" });
        byDay.set(item.iso, rows);
      }
      const days = [...byDay.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([iso,rows]) => ({ iso, label:dayBandLabel(iso,today), today:iso === today, rows }));
      return { ...calendar, days };
    }
    const week = await gymSchedule(calendar.id, 0);
    const days: WeekDayRows[] = (week?.days ?? []).flatMap((day) => {
      const rows = day.items.map((item) => {
        const time = clockParts(item.startTime);
        return {
          key:`${calendar.id}|${item.id}|${day.iso}`,
          classId:item.id,
          iso:day.iso,
          name:item.name,
          where:calendar.name,
          hm:time.hm,
          ap:time.ap,
          dur:`${item.durationMin} min`,
          coach:item.onName ? { id:item.onUserId ?? item.id, name:item.onName, photo:null, color:"var(--color-olive)" } : null,
          tag:item.onName || "Open shift",
          tagTone:item.onName ? "coaching" as const : "shift" as const,
        };
      });
      return rows.length ? [{ iso:day.iso, label:dayBandLabel(day.iso, today), today:day.iso === today, rows }] : [];
    });
    return { ...calendar, days };
  }));
  return (
    <CalendarScreen
      savedDays={savedDays}
      handle={me.handle}
      viewer={{
        id: me.id,
        name: me.name,
        photo: me.photoThumb ?? me.photo,
        color: avatarColor(me),
      }}
      classes={classes}
      todayIso={today}
      studios={studios}
      openAdder={add === "1"}
      member={member}
      managedCalendars={managedCalendars}
      managedCalendarViews={managedCalendarViews}
    />
  );
}
