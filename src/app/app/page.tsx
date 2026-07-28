import { desc, eq, inArray, isNull, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { adminEmails } from "@/lib/admin";
import { feedbackHost } from "@/lib/feedback";
import { fansVisible } from "@/lib/flags";
import { avatarColor } from "@/lib/avatar";
import { coachAnalytics } from "@/lib/visits";
import { unreadNotifications } from "@/lib/notify";
import { googleConfigured, isGoogleConnected } from "@/lib/gcal";
import type { ClassDto, LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import { ScheduleScreen } from "@/components/ScheduleScreen";
import { SetPasswordPrompt } from "@/components/SetPasswordPrompt";

export const dynamic = "force-dynamic";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string; setpw?: string }>;
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
  const fbHost = await feedbackHost();
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
  const analytics = await coachAnalytics(userId);
  const notifUnread = await unreadNotifications(userId);

  // The schedule is an infinite forward calendar; hand the client every class
  // (weekly + one-offs) and today's date, and it lays out the dated days.
  const classes: ClassDto[] = classRows.map((c) => ({
    id: c.id,
    templateId: c.templateId,
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

  const { add, setpw } = await searchParams;

  return (
    <>
    {setpw === "1" && !user?.passwordHash && <SetPasswordPrompt email={user?.email ?? ""} />}
    <ScheduleScreen
      classes={classes}
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
      canSendFeedback={!!fbHost && fbHost.email.toLowerCase() !== (user?.email ?? "").toLowerCase()}
      showFanView={await fansVisible()}
      discoverable={user?.discoverable ?? true}
      userId={userId}
      myColor={user?.avatarColor ?? null}
      look={user?.look ?? null}
    />
    </>
  );
}
