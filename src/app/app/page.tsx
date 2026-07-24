import { desc, eq, isNull, and } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import type { ClassDto, LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import { ScheduleScreen } from "@/components/ScheduleScreen";

export const dynamic = "force-dynamic";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const userId = (await getSessionUserId())!;
  const db = await getDb();

  const [classRows, studioRows, templateRows, subRows] = await Promise.all([
    db.select().from(schema.classes).where(eq(schema.classes.userId, userId)),
    db.select().from(schema.studios).orderBy(schema.studios.seq),
    db
      .select()
      .from(schema.classTemplates)
      .where(eq(schema.classTemplates.userId, userId))
      .orderBy(desc(schema.classTemplates.updatedAt)),
    db
      .select({ id: schema.subscribers.id })
      .from(schema.subscribers)
      .where(and(eq(schema.subscribers.trainerUserId, userId), isNull(schema.subscribers.optedOutAt))),
  ]);

  const classes: ClassDto[] = classRows.map((c) => ({
    id: c.id,
    dayOfWeek: c.dayOfWeek,
    startTime: c.startTime,
    durationMin: c.durationMin,
    name: c.name,
    studioId: c.studioId,
    links: c.links,
  }));
  const studios: StudioDto[] = studioRows.map((s) => ({
    id: s.id,
    seq: s.seq,
    name: s.name,
    address: s.address,
  }));
  const templates: TemplateDto[] = templateRows.map((t) => ({
    name: t.name,
    startTime: t.startTime,
    durationMin: t.durationMin,
    studioId: t.studioId,
    links: t.links,
  }));

  // Smart defaults: the most recently published template is "last used".
  const lastUsed: LastUsed = templates.length
    ? {
        startTime: templates[0].startTime,
        durationMin: templates[0].durationMin,
        studioId: templates[0].studioId,
      }
    : { startTime: "06:00", durationMin: 50, studioId: studios[0]?.id ?? null };

  const { add } = await searchParams;

  return (
    <ScheduleScreen
      classes={classes}
      studios={studios}
      templates={templates}
      lastUsed={lastUsed}
      subsCount={subRows.length}
      autoOpenAdder={add === "1"}
    />
  );
}
