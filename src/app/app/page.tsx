import { desc, eq, isNull, and } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { appTheme, fmtDateLong, mondayOfCurrentWeek, timeToMinutes, weekBucket } from "@/lib/format";
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
      .select({ theme: schema.users.theme, handle: schema.users.handle })
      .from(schema.users)
      .where(eq(schema.users.id, userId)),
    visitsThisWeek(userId),
  ]);
  const gconn = await isGoogleConnected(userId);

  const weekLabel = new Date(`${mondayOfCurrentWeek()}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  // "Mon, July 20" for each weekday of the current week — the day heading.
  // Computed server-side (UTC) to avoid hydration drift.
  const weekDateLabels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${mondayOfCurrentWeek()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return fmtDateLong(d.toISOString().slice(0, 10));
  });

  const toDto = (c: (typeof classRows)[number]): ClassDto => ({
    id: c.id,
    dayOfWeek: c.dayOfWeek,
    specificDate: c.specificDate,
    startTime: c.startTime,
    durationMin: c.durationMin,
    name: c.name,
    studioId: c.studioId,
    links: c.links,
  });
  // Weekly classes + this week's one-offs render in the gutter; future-dated
  // one-offs go in an "Upcoming" list; past one-offs drop off entirely.
  const buckets = classRows.map((c) => ({ c, bucket: weekBucket(c.specificDate) }));
  const classes: ClassDto[] = buckets.filter((b) => b.bucket === "current").map((b) => toDto(b.c));
  const upcoming: ClassDto[] = buckets
    .filter((b) => b.bucket === "upcoming")
    .map((b) => toDto(b.c))
    .sort(
      (a, b) =>
        (a.specificDate! < b.specificDate! ? -1 : a.specificDate! > b.specificDate! ? 1 : 0) ||
        timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
    );
  // "First publish" narration keys off whether the trainer has any class at all,
  // not just this week's — a coach with only upcoming one-offs isn't new.
  const hasAnyClass = classRows.length > 0;
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
      upcoming={upcoming}
      hasAnyClass={hasAnyClass}
      studios={studios}
      templates={templates}
      lastUsed={lastUsed}
      subsCount={subRows.length}
      autoOpenAdder={add === "1"}
      theme={appTheme(user?.theme)}
      weekLabel={weekLabel}
      weekDateLabels={weekDateLabels}
      handle={user?.handle ?? ""}
      visits={visits}
      classCount={classRows.length}
      googleConfigured={googleConfigured()}
      googleConnected={gconn.connected}
      googleEmail={gconn.email}
    />
  );
}
