import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { todayIso } from "@/lib/format";
import type { LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import { myWeek } from "@/lib/week";
import { ShareComposer } from "@/components/ShareComposer";

export const dynamic = "force-dynamic";

// The Share tab's editor, opened by the middle of the tab bar.
//
// It is a full screen rather than a sheet, and it deliberately carries no tab
// bar: it opens over the app and the X is the way off.
//
// It loads the adder's ingredients too, because making the picture and keeping
// the calendar are the same act: the classes sheet adds as well as picks, and
// a class typed there lands on the calendar and, when a studio was named, in
// that studio's catalog. That is the whole growth argument for this screen, so
// the form has to be one tap from the picture rather than a trip to another
// tab and back.
export default async function SharePage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [week, studioRows, templateRows, customTypeRows, [me]] = await Promise.all([
    // The range starts on the first day their week actually holds something.
    // Opening on an empty picture somebody then has to debug is the failure
    // the member's sheet already learned once.
    myWeek(userId),
    db.select().from(schema.studios).orderBy(schema.studios.seq),
    db
      .select()
      .from(schema.classTemplates)
      .where(eq(schema.classTemplates.userId, userId))
      .orderBy(desc(schema.classTemplates.updatedAt)),
    db.select({ name: schema.customClassTypes.name }).from(schema.customClassTypes),
    db.select().from(schema.users).where(eq(schema.users.id, userId)),
  ]);
  if (!me) redirect("/");
  if (me.handle && !me.onboardedAt) redirect("/welcome");

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

  const today = todayIso();
  const first = week.find((d) => d.items.length > 0)?.iso;

  return (
    <ShareComposer
      canCoach={me.kind !== "fan"}
      hasPhoto={!!me.photo}
      today={today}
      firstIso={first && first > today ? first : today}
      studios={studios}
      templates={templates}
      customTypes={customTypeRows.map((r) => r.name)}
      lastUsed={lastUsed}
    />
  );
}
