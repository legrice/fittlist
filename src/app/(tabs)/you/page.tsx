import { eq, and, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { adminEmails } from "@/lib/admin";
import { feedbackHost } from "@/lib/feedback";
import { fansVisible } from "@/lib/flags";
import { googleConfigured, isGoogleConnected } from "@/lib/gcal";
import { getSessionUserId } from "@/lib/session";
import { myWeek } from "@/lib/week";
import { MemberAccount } from "@/components/MemberAccount";
import { ProfileSheet } from "@/components/ProfileSheet";

export const dynamic = "force-dynamic";

// The You tab: the person, for both kinds. A member gets their account rows;
// a coach gets the same account screen that used to be an overlay on the
// schedule, rendered as the page it always wanted to be. The calendar is the
// Schedule tab next door, and the two no longer share a screen.
export default async function YouPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) redirect("/");
  // Claimed a link but never finished setup: the wizard is the better landing.
  if (me.handle && !me.onboardedAt) redirect("/welcome");

  const host = await feedbackHost();
  const canSendFeedback = !!host && host.email.toLowerCase() !== me.email.toLowerCase();

  if (me.kind === "fan") {
    if (!(await fansVisible())) redirect("/");
    const [going, week] = await Promise.all([
      db
        .select({ id: schema.attendances.id })
        .from(schema.attendances)
        .where(eq(schema.attendances.userId, userId)),
      // For the share poster's starting day: the first day their week holds
      // something, not an empty today.
      myWeek(userId),
    ]);

    return (
      <MemberAccount
        name={me.name}
        email={me.email}
        handle={me.handle}
        title={me.title ?? ""}
        about={me.about ?? ""}
        location={me.location ?? ""}
        photo={me.photo}
        color={avatarColor(me)}
        look={me.look}
        goingCount={going.length}
        firstIso={week[0]?.iso}
        openEditor={edit === "1"}
        canSendFeedback={canSendFeedback}
        discoverable={me.discoverable}
        approveFollowers={me.approveFollowers}
        messagesOpen={me.messagesOpen}
      />
    );
  }

  // A coach mid-signup has no handle yet; the account screen assumes one.
  if (!me.handle) redirect("/welcome");

  // All independent, so they load together rather than stacking round trips.
  const [gconn, passkeyRows, inboxRows, subRows, shiftRows, followingRows] = await Promise.all([
    isGoogleConnected(userId),
    db
      .select({ id: schema.credentials.id })
      .from(schema.credentials)
      .where(eq(schema.credentials.userId, userId)),
    db
      .select({ n: schema.inquiryThreads.coachUnread, kind: schema.inquiryThreads.kind })
      .from(schema.inquiryThreads)
      .where(eq(schema.inquiryThreads.coachUserId, userId)),
    db
      .select({ id: schema.subscribers.id })
      .from(schema.subscribers)
      .where(
        and(eq(schema.subscribers.trainerUserId, userId), isNull(schema.subscribers.optedOutAt)),
      ),
    db
      .select({ id: schema.classes.id })
      .from(schema.classes)
      .where(eq(schema.classes.coachUserId, userId)),
    // Who you follow. Followers was a live number beside a dead one for
    // months; a count of people is a list, and all three of them open one.
    db
      .select({ id: schema.subscribers.id })
      .from(schema.subscribers)
      .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt))),
  ]);
  // Requests are inquiries only: the admin is a coach too, and their feedback
  // threads live on the same table.
  const requestCount = inboxRows.filter((r) => r.kind === "inquiry").length;

  return (
    <ProfileSheet
      page
      anim="none"
      handle={me.handle}
      name={me.name}
      title={me.title ?? ""}
      photo={me.photo}
      subsCount={subRows.length}
      followingCount={followingRows.filter((r) => r.id).length}
      requestCount={requestCount}
      email={me.email}
      instagram={me.instagram ?? ""}
      website={me.website ?? ""}
      contactEmail={me.contactEmail ?? ""}
      phone={me.phone ?? ""}
      whatsapp={me.whatsapp ?? ""}
      about={me.about ?? ""}
      availability={me.availability ?? null}
      googleConfigured={googleConfigured()}
      googleConnected={gconn.connected}
      googleEmail={gconn.email}
      hasPassword={!!me.passwordHash}
      passkeyCount={passkeyRows.length}
      isAdmin={adminEmails().includes(me.email.toLowerCase())}
      canSendFeedback={canSendFeedback}
      shiftCount={shiftRows.length}
      shiftsPublic={me.shiftsPublic}
      avatarColor={avatarColor(me)}
      showFanView={await fansVisible()}
      discoverable={me.discoverable}
      approveFollowers={me.approveFollowers}
      messagesOpen={me.messagesOpen}
      look={me.look}
    />
  );
}
