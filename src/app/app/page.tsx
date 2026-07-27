import { desc, eq, inArray, isNull, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { adminEmails } from "@/lib/admin";
import { fansVisible } from "@/lib/flags";
import { avatarColor } from "@/lib/avatar";
import { coachAnalytics } from "@/lib/visits";
import { unreadNotifications } from "@/lib/notify";
import { googleConfigured, isGoogleConnected } from "@/lib/gcal";
import type { AttendingDto, ClassDto, LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import { ScheduleScreen } from "@/components/ScheduleScreen";

export const dynamic = "force-dynamic";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const userId = (await getSessionUserId())!;
  const db = await getDb();

  const [classRows, studioRows, templateRows, subRows, [user]] = await Promise.all([
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
        look: schema.users.look,
        discoverable: schema.users.discoverable,
        avatarColor: schema.users.avatarColor,
        handle: schema.users.handle,
        name: schema.users.name,
        title: schema.users.title,
        about: schema.users.about,
        email: schema.users.email,
        instagram: schema.users.instagram,
        website: schema.users.website,
        contactEmail: schema.users.contactEmail,
        phone: schema.users.phone,
        whatsapp: schema.users.whatsapp,
        photo: schema.users.photo,
        passwordHash: schema.users.passwordHash,
        onboardedAt: schema.users.onboardedAt,
        announcement: schema.users.announcement,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId)),
  ]);

  // First run after claiming a handle: send them through the setup wizard
  // (photo, profile, studios) before they land on their schedule.
  if (user && !user.onboardedAt) redirect("/welcome");
  const gconn = await isGoogleConnected(userId);
  const passkeyRows = await db
    .select({ id: schema.credentials.id })
    .from(schema.credentials)
    .where(eq(schema.credentials.userId, userId));
  const customTypeRows = await db
    .select({ name: schema.customClassTypes.name })
    .from(schema.customClassTypes)
    .orderBy(schema.customClassTypes.name);
  const customTypes = customTypeRows.map((r) => r.name);
  const inboxRows = await db
    .select({ n: schema.inquiryThreads.coachUnread })
    .from(schema.inquiryThreads)
    .where(eq(schema.inquiryThreads.coachUserId, userId));
  const inboxUnread = inboxRows.reduce((sum, r) => sum + (r.n || 0), 0);
  const requestCount = inboxRows.length;
  // Classes this coach is attending as a participant (the member side). Their
  // own page never shows these — this is only their private week.
  const attendRows = await db
    .select({
      classId: schema.attendances.classId,
      occurrenceDate: schema.attendances.occurrenceDate,
    })
    .from(schema.attendances)
    .where(eq(schema.attendances.userId, userId));
  const attendClassIds = [...new Set(attendRows.map((a) => a.classId))];
  const attendClasses = attendClassIds.length
    ? await db.select().from(schema.classes).where(inArray(schema.classes.id, attendClassIds))
    : [];
  const attendClassById = new Map(attendClasses.map((c) => [c.id, c]));
  const attendCoachIds = [...new Set(attendClasses.map((c) => c.userId))];
  const attendCoaches = attendCoachIds.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, attendCoachIds))
    : [];
  const attendCoachById = new Map(attendCoaches.map((c) => [c.id, c]));
  const attendStudioIds = [
    ...new Set(attendClasses.map((c) => c.studioId).filter((x): x is string => !!x)),
  ];
  const attendStudios = attendStudioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, attendStudioIds))
    : [];
  const attendStudioById = new Map(attendStudios.map((s) => [s.id, s]));
  const todayForAttend = new Date().toISOString().slice(0, 10);
  const attending: AttendingDto[] = attendRows.flatMap((a) => {
    const c = attendClassById.get(a.classId);
    const coach = c ? attendCoachById.get(c.userId) : undefined;
    if (!c || !coach?.handle || a.occurrenceDate < todayForAttend) return [];
    return [
      {
        classId: c.id,
        iso: a.occurrenceDate,
        startTime: c.startTime,
        durationMin: c.durationMin,
        name: c.name,
        where: (c.studioId && attendStudioById.get(c.studioId)?.name) || c.location,
        coachName: coach.name,
        coachHandle: coach.handle,
        coachPhoto: coach.photo,
        coachColor: avatarColor(coach),
      },
    ];
  });

  const analytics = await coachAnalytics(userId);
  const notifUnread = await unreadNotifications(userId);

  // The schedule is an infinite forward calendar; hand the client every class
  // (weekly + one-offs) and today's date, and it lays out the dated days.
  const classes: ClassDto[] = classRows.map((c) => ({
    id: c.id,
    templateId: c.templateId,
    dayOfWeek: c.dayOfWeek,
    specificDate: c.specificDate,
    startTime: c.startTime,
    durationMin: c.durationMin,
    name: c.name,
    classType: c.classType,
    description: c.description,
    studioId: c.studioId,
    location: c.location,
    isPublic: c.isPublic,
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
    location: t.location,
    isPublic: t.isPublic,
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
      attending={attending}
      hasAnyClass={hasAnyClass}
      todayIso={todayIso}
      studios={studios}
      templates={templates}
      customTypes={customTypes}
      lastUsed={lastUsed}
      subsCount={subRows.length}
      inboxUnread={inboxUnread}
      notifUnread={notifUnread}
      profileViews={analytics.profileViews}
      scheduleOpens={analytics.scheduleOpens}
      requestCount={requestCount}
      autoOpenAdder={add === "1"}
      handle={user?.handle ?? ""}
      name={user?.name ?? ""}
      title={user?.title ?? ""}
      photo={user?.photo ?? null}
      email={user?.email ?? ""}
      instagram={user?.instagram ?? ""}
      website={user?.website ?? ""}
      contactEmail={user?.contactEmail ?? ""}
      phone={user?.phone ?? ""}
      whatsapp={user?.whatsapp ?? ""}
      about={user?.about ?? ""}
      googleConfigured={googleConfigured()}
      googleConnected={gconn.connected}
      googleEmail={gconn.email}
      hasPassword={!!user?.passwordHash}
      passkeyCount={passkeyRows.length}
      isAdmin={!!user?.email && adminEmails().includes(user.email.toLowerCase())}
      showFanView={await fansVisible()}
      discoverable={user?.discoverable ?? true}
      userId={userId}
      myColor={user?.avatarColor ?? null}
      look={user?.look ?? null}
    />
  );
}
