import { desc, eq, isNull, and } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { visitsThisWeek } from "@/lib/visits";
import { googleConfigured, isGoogleConnected } from "@/lib/gcal";
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

  const [classRows, studioRows, templateRows, subRows, [user], visits] = await Promise.all([
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
    db
      .select({
        theme: schema.users.theme,
        handle: schema.users.handle,
        name: schema.users.name,
        title: schema.users.title,
        about: schema.users.about,
        instagram: schema.users.instagram,
        website: schema.users.website,
        photo: schema.users.photo,
        passwordHash: schema.users.passwordHash,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId)),
    visitsThisWeek(userId),
  ]);
  const gconn = await isGoogleConnected(userId);
  const passkeyRows = await db
    .select({ id: schema.credentials.id })
    .from(schema.credentials)
    .where(eq(schema.credentials.userId, userId));

  // The schedule is an infinite forward calendar; hand the client every class
  // (weekly + one-offs) and today's date, and it lays out the dated days.
  const classes: ClassDto[] = classRows.map((c) => ({
    id: c.id,
    dayOfWeek: c.dayOfWeek,
    specificDate: c.specificDate,
    startTime: c.startTime,
    durationMin: c.durationMin,
    name: c.name,
    classType: c.classType,
    description: c.description,
    studioId: c.studioId,
    links: c.links,
  }));
  const todayIso = new Date().toISOString().slice(0, 10);
  const hasAnyClass = classRows.length > 0;
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
      hasAnyClass={hasAnyClass}
      todayIso={todayIso}
      studios={studios}
      templates={templates}
      lastUsed={lastUsed}
      subsCount={subRows.length}
      autoOpenAdder={add === "1"}
      handle={user?.handle ?? ""}
      name={user?.name ?? ""}
      title={user?.title ?? ""}
      photo={user?.photo ?? null}
      visits={visits}
      classCount={classRows.length}
      googleConfigured={googleConfigured()}
      googleConnected={gconn.connected}
      googleEmail={gconn.email}
      hasPassword={!!user?.passwordHash}
      passkeyCount={passkeyRows.length}
    />
  );
}
