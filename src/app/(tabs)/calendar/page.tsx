import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { mySchedule } from "@/lib/coachweek";
import { todayIso } from "@/lib/format";
import type { ClassDto, StudioDto } from "@/lib/types";
import { CalendarScreen } from "@/components/CalendarScreen";
import { myWeek } from "@/lib/week";
import { avatarColor } from "@/lib/avatar";
import { currentUser } from "@/lib/current-user";

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

  const [classRows, studioRows, savedDays] = await Promise.all([
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
    />
  );
}
