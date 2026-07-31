import { desc, eq, inArray, isNull, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { mySchedule } from "@/lib/coachweek";
import { todayIso } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { adminEmails } from "@/lib/admin";
import { invitesBannerCount } from "@/app/actions/invites";
import { feedbackHost, feedbackPromptDue } from "@/lib/feedback";
import { fansVisible } from "@/lib/flags";
import { avatarColor } from "@/lib/avatar";
import { coachAnalytics } from "@/lib/visits";
import { unreadNotifications } from "@/lib/notify";
import { weekCount } from "@/lib/week";
import { googleConfigured, isGoogleConnected } from "@/lib/gcal";
import type { ClassDto, LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import { ScheduleScreen } from "@/components/ScheduleScreen";
import { adminNewActivityCount } from "@/lib/adminactivity";
import { FeedbackPrompt } from "@/components/FeedbackPrompt";
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
    // Their own classes and the shifts they're on, covers folded in. Always
    // both here: shiftsPublic is about who else sees them, not about whether
    // the coach can see their own week.
    mySchedule(userId),
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
        approveFollowers: schema.users.approveFollowers,
        messagesOpen: schema.users.messagesOpen,
        shiftsPublic: schema.users.shiftsPublic,
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
        availability: schema.users.availability,
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
  // All independent, so they load together: awaited one by one they stacked
  // nine round trips onto every open of the schedule.
  const [
    gconn,
    fbHost,
    askFeedback,
    invitesLeft,
    passkeyRows,
    customTypeRows,
    inboxRows,
    analytics,
    notifUnread,
    week,
    shiftRows,
  ] = await Promise.all([
    isGoogleConnected(userId),
    feedbackHost(),
    feedbackPromptDue(userId),
    invitesBannerCount(),
    db
      .select({ id: schema.credentials.id })
      .from(schema.credentials)
      .where(eq(schema.credentials.userId, userId)),
    db
      .select({ name: schema.customClassTypes.name })
      .from(schema.customClassTypes)
      .orderBy(schema.customClassTypes.name),
    db
      .select({ n: schema.inquiryThreads.coachUnread, kind: schema.inquiryThreads.kind })
      .from(schema.inquiryThreads)
      .where(eq(schema.inquiryThreads.coachUserId, userId)),
    coachAnalytics(userId),
    unreadNotifications(userId),
    // A coach follows people too, so they get the same shortlist.
    weekCount(userId),
    // On a gym's rota? Then the calendar row says shifts, because that is what
    // they came looking for.
    db
      .select({ id: schema.classes.id })
      .from(schema.classes)
      .where(eq(schema.classes.coachUserId, userId)),
  ]);
  const adminNew = user && adminEmails().includes(user.email.toLowerCase())
    ? await adminNewActivityCount(userId)
    : null;

  const customTypes = customTypeRows.map((r) => r.name);
  const inboxUnread = inboxRows.reduce((sum, r) => sum + (r.n || 0), 0);
  // Requests are inquiries only. The admin is a coach too, so their feedback
  // threads live on this table and were being counted as people who had asked
  // them about private sessions.
  const requestCount = inboxRows.filter((r) => r.kind === "inquiry").length;

  const studioById = new Map(studioRows.map((st) => [st.id, st]));
  // The schedule is an infinite forward calendar; hand the client every class
  // (weekly + one-offs) and today's date, and it lays out the dated days.
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
    // A shift's class page lives under the studio, because that is who owns it.
    shiftBase: c.shift && c.studioId ? studioById.get(c.studioId)?.slug ?? null : null,
  }));
  const today = todayIso();
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
      todayIso={today}
      studios={studios}
      templates={templates}
      customTypes={customTypes}
      lastUsed={lastUsed}
      subsCount={subRows.length}
      inboxUnread={inboxUnread}
      notifUnread={notifUnread}
      adminNew={adminNew}
      weekCount={week}
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
      availability={user?.availability ?? null}
      googleConfigured={googleConfigured()}
      googleConnected={gconn.connected}
      googleEmail={gconn.email}
      hasPassword={!!user?.passwordHash}
      passkeyCount={passkeyRows.length}
      isAdmin={!!user?.email && adminEmails().includes(user.email.toLowerCase())}
      canSendFeedback={!!fbHost && fbHost.email.toLowerCase() !== (user?.email ?? "").toLowerCase()}
      shiftCount={shiftRows.length}
      shiftsPublic={user?.shiftsPublic ?? false}
      showFanView={await fansVisible()}
      discoverable={user?.discoverable ?? true}
      approveFollowers={user?.approveFollowers ?? false}
      messagesOpen={user?.messagesOpen ?? true}
      userId={userId}
      myColor={user?.avatarColor ?? null}
      invitesLeft={invitesLeft}
      look={user?.look ?? null}
    />
    {askFeedback && fbHost && <FeedbackPrompt hostName={fbHost.name.trim() || "We"} />}
    </>
  );
}
