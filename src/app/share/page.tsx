import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { todayIso } from "@/lib/format";
import type { LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import { shareWeek } from "@/lib/shareweek";
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
  const [studioRows, templateRows, customTypeRows, [me]] = await Promise.all([
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
  // A member has no week of their own to draw. The composer was theirs too
  // while a going week existed; it does not, so the screen is a coach's and
  // the image route holds the same wall.
  if (me.kind === "fan") redirect("/feed");

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
    : { startTime: "18:00", durationMin: 60, studioId: null };

  const today = todayIso();
  // Open on the first day the week actually holds something. Opening on an
  // empty picture somebody then has to debug is a failure this screen has
  // already learned once. It reads the same loader the picture does, so the
  // day it lands on is a day with rows on it.
  const first = (await shareWeek(userId, today, 7)).find((d) => d.items.length > 0)?.iso;

  return (
    <ShareComposer
      today={today}
      firstIso={first && first > today ? first : today}
      studios={studios}
      templates={templates}
      customTypes={customTypeRows.map((r) => r.name)}
      lastUsed={lastUsed}
    />
  );
}
