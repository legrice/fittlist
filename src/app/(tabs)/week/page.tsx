import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { CAL_PAST_DAYS, todayIso } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import type { LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import { myWeek } from "@/lib/week";
import { WeekScreen } from "@/components/WeekScreen";

export const dynamic = "force-dynamic";

// Your plans: the shortlist of classes you added, from today forward.
//
// It lives in the tabs group because it is the first tab. Outside it, tapping
// Plans would unmount the header and the bar and build a second copy of them,
// which is the whole reason that layout exists. The header, the tab bar and
// the dark-mode flag all come from the layout above this now.
//
// It loads the adder's ingredients too, because adding a class you go to is
// the same form as adding one you teach: the studio directory, your own saved
// classes, the shared type list.
export default async function WeekPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [days, studioRows, templateRows, customTypeRows, [me]] = await Promise.all([
    // The past window rides along so the list can scroll back in time.
    myWeek(userId, { pastDays: CAL_PAST_DAYS }),
    db.select().from(schema.studios).orderBy(schema.studios.seq),
    db
      .select()
      .from(schema.classTemplates)
      .where(eq(schema.classTemplates.userId, userId))
      .orderBy(desc(schema.classTemplates.updatedAt)),
    db.select({ name: schema.customClassTypes.name }).from(schema.customClassTypes),
    db.select().from(schema.users).where(eq(schema.users.id, userId)),
  ]);

  const studios: StudioDto[] = studioRows.map((s) => ({
    id: s.id,
    seq: s.seq,
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
    : { startTime: "18:00", durationMin: 60, studioId: null };

  // A coach's calendar is /app, and everything here is merged into it now:
  // /week is the member's Schedule tab, and a coach landing on an old link is
  // sent to their own.
  if (me && me.kind !== "fan") redirect("/app");

  return (
    <WeekScreen
      days={days}
      todayIso={todayIso()}
      studios={studios}
      templates={templates}
      customTypes={customTypeRows.map((r) => r.name)}
      lastUsed={lastUsed}
    />
  );
}
