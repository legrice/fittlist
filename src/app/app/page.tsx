import { desc, eq, inArray, isNull, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { mySchedule } from "@/lib/coachweek";
import { CAL_PAST_DAYS, todayIso } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { invitesBannerCount } from "@/app/actions/invites";
import { feedbackHost, feedbackPromptDue } from "@/lib/feedback";
import { fansVisible, landingHref } from "@/lib/flags";
import { avatarColor } from "@/lib/avatar";
import { unreadNotifications } from "@/lib/notify";
import { myCircles } from "@/lib/circles";
import { myWeek } from "@/lib/week";
import type { ClassDto, LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import { ScheduleScreen } from "@/components/ScheduleScreen";
import { FeedbackPrompt } from "@/components/FeedbackPrompt";
import { SetPasswordPrompt } from "@/components/SetPasswordPrompt";

export const dynamic = "force-dynamic";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string; setpw?: string; acct?: string }>;
}) {
  const userId = (await getSessionUserId())!;
  // The account left this screen for the You tab; old ?acct=1 links (the
  // gear's href for months) land there.
  const { add, setpw, acct } = await searchParams;
  if (acct) redirect("/you");
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
        kind: schema.users.kind,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId)),
  ]);

  // First run after claiming a handle: send them through the setup wizard
  // (photo, profile, studios) before they land on their schedule.
  if (user && !user.onboardedAt) redirect("/welcome");
  // This is the coach's calendar, and a member has no business on it: it
  // offers adding a class to a public page they cannot have, and its empty
  // state says "add the classes you coach" to somebody who coaches none.
  //
  // It matters more than a stray URL, because the installed app's start_url
  // is /app: every member who put fittlist on their home screen was landing
  // here on every launch. /week already redirects a coach to /app, and this
  // is that rule said in the other direction, so neither kind can arrive on
  // the other's calendar.
  if (user && user.kind === "fan") redirect(await landingHref());
  // All independent, so they load together: awaited one by one they stacked
  // nine round trips onto every open of the schedule.
  const [fbHost, askFeedback, invitesLeft, customTypeRows, inboxRows, notifUnread, plans, circles] =
    await Promise.all([
      feedbackHost(),
      feedbackPromptDue(userId),
      invitesBannerCount(),
      db
        .select({ name: schema.customClassTypes.name })
        .from(schema.customClassTypes)
        .orderBy(schema.customClassTypes.name),
      db
        .select({ n: schema.inquiryThreads.coachUnread })
        .from(schema.inquiryThreads)
        .where(eq(schema.inquiryThreads.coachUserId, userId)),
      unreadNotifications(userId),
      // A coach goes to classes too: the same loader the member calendar
      // reads, so the schedule is one calendar of everything. The past
      // window rides along because the Month grid draws its dimmed past days
      // from it; the List itself starts at today and stops there.
      myWeek(userId, { pastDays: CAL_PAST_DAYS }),
      // A coach follows coaches. Their Schedule wears the same tray a
      // member's does, for the same reason: it is the only thing a follow
      // does now, and a coach who follows five people and sees no faces
      // would conclude the button does nothing.
      myCircles(userId),
    ]);

  const customTypes = customTypeRows.map((r) => r.name);
  const inboxUnread = inboxRows.reduce((sum, r) => sum + (r.n || 0), 0);

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
    duplicateOf: c.duplicateOf,
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
    image: t.image,
    startTime: t.startTime,
    durationMin: t.durationMin,
    studioId: t.studioId,
    location: t.location,
    withWho: t.withWho,
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
      plans={plans}
      circles={circles}
      autoOpenAdder={add === "1"}
      handle={user?.handle ?? ""}
      name={user?.name ?? ""}
      photo={user?.photo ?? null}
      showFanView={await fansVisible()}
      landing={await landingHref()}
      userId={userId}
      myColor={user?.avatarColor ?? null}
      invitesLeft={invitesLeft}
    />
    {askFeedback && fbHost && <FeedbackPrompt hostName={fbHost.name.trim() || "We"} />}
    </>
  );
}
