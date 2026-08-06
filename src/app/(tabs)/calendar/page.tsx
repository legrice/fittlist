import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { mySchedule } from "@/lib/coachweek";
import { todayIso } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import type { ClassDto, LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import { CalendarScreen } from "@/components/CalendarScreen";

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
export default async function CalendarPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) redirect("/");
  // Only somebody who teaches has a calendar. A member landing here has no
  // week of their own to show, so they go where their week actually is.
  if (me.kind === "fan") redirect("/feed");

  const [classRows, studioRows, templateRows, customTypeRows, subRows] = await Promise.all([
    // The same loader the coach shell used: their own classes with the gym
    // shifts folded in, because a coach who is on Thursday at seven has to be
    // able to see that they are on Thursday at seven.
    mySchedule(userId),
    db.select().from(schema.studios).orderBy(schema.studios.seq),
    db
      .select()
      .from(schema.classTemplates)
      .where(eq(schema.classTemplates.userId, userId))
      .orderBy(desc(schema.classTemplates.updatedAt)),
    db.select({ name: schema.customClassTypes.name }).from(schema.customClassTypes),
    db
      .select({ id: schema.subscribers.id })
      .from(schema.subscribers)
      .where(eq(schema.subscribers.trainerUserId, userId)),
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
  const templates: TemplateDto[] = templateRows.map((t) => ({
    name: t.name,
    classType: t.classType,
    description: t.description,
    image: t.image,
    startTime: t.startTime,
    durationMin: t.durationMin,
    studioId: t.studioId,
    location: t.location,
    withWho: t.withWho,
    isPublic: t.isPublic,
    links: t.links,
  }));
  const lastUsed: LastUsed = templates.length
    ? {
        startTime: templates[0].startTime,
        durationMin: templates[0].durationMin,
        studioId: templates[0].studioId,
      }
    : { startTime: "06:00", durationMin: 50, studioId: studios[0]?.id ?? null };

  return (
    <CalendarScreen
      classes={classes}
      todayIso={todayIso()}
      studios={studios}
      templates={templates}
      customTypes={customTypeRows.map((r) => r.name)}
      lastUsed={lastUsed}
      subsCount={subRows.length}
    />
  );
}
