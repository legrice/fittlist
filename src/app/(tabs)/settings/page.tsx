import { eq, and, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { adminEmails } from "@/lib/admin";
import { feedbackHost } from "@/lib/feedback";
import { fansVisible } from "@/lib/flags";
import { googleConfigured, isGoogleConnected } from "@/lib/gcal";
import { getSessionUserId } from "@/lib/session";
import { myStaffStudios } from "@/app/actions/gym";
import { MemberAccount } from "@/components/MemberAccount";
import { ProfileSheet } from "@/components/ProfileSheet";

export const dynamic = "force-dynamic";

// Settings, for both kinds: a member gets their account rows, a coach the
// fuller set. It was the You tab for a while, which put a list of switches
// behind a word that means a page with your face on it; the tab opens the
// profile now and this is the gear on it. It keeps the tab bar, because it
// sits inside the tabs group and the bar is the way back out.
export default async function SettingsPage({
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
    // The two relationships, and the studios they run. No week: a member has
    // no calendar of their own in this build, so there is nothing here to
    // count classes from or to draw a poster of.
    const [fanFollowing, fanFollowers, fanRuns] = await Promise.all([
      db
        .select({ id: schema.subscribers.id })
        .from(schema.subscribers)
        .innerJoin(schema.users, eq(schema.users.id, schema.subscribers.trainerUserId))
        .where(
          and(
            eq(schema.subscribers.email, me.email),
            isNull(schema.subscribers.optedOutAt),
            eq(schema.users.kind, "coach"),
          ),
        ),
      db
        .select({ id: schema.subscribers.id })
        .from(schema.subscribers)
        .where(
          and(
            eq(schema.subscribers.trainerUserId, userId),
            isNull(schema.subscribers.optedOutAt),
          ),
        ),
      // A member can be staff at a studio too, and had the same dead end.
      myStaffStudios(),
    ]);

    return (
      <div className="cardwrap">
      <MemberAccount
        runs={fanRuns}
        name={me.name}
        email={me.email}
        handle={me.handle}
        title={me.title ?? ""}
        about={me.about ?? ""}
        location={me.location ?? ""}
        photo={me.photo}
        color={avatarColor(me)}
        look={me.look}
        followingCount={fanFollowing.length}
        followerCount={fanFollowers.length}
        openEditor={edit === "1"}
        canSendFeedback={canSendFeedback}
        discoverable={me.discoverable}
        approveFollowers={me.approveFollowers}
        messagesOpen={me.messagesOpen}
      />
      </div>
    );
  }

  // A coach mid-signup has no handle yet; the account screen assumes one.
  if (!me.handle) redirect("/welcome");

  // All independent, so they load together rather than stacking round trips.
  const [gconn, passkeyRows, inboxRows, subRows, shiftRows, followingRows, runRows] =
    await Promise.all([
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
      .innerJoin(schema.users, eq(schema.users.id, schema.subscribers.trainerUserId))
      .where(
        and(
          eq(schema.subscribers.email, me.email),
          isNull(schema.subscribers.optedOutAt),
          eq(schema.users.kind, "coach"),
        ),
      ),
    // The studios this person runs. Managing a place was reachable only from
    // the studio's own page, so somebody who runs a gym but doesn't teach at
    // it had no listing anywhere: Where I coach is driven by coach_studios,
    // which a manager need not have a row in.
    myStaffStudios(),
  ]);
  // Requests are inquiries only: the admin is a coach too, and their feedback
  // threads live on the same table.
  const requestCount = inboxRows.filter((r) => r.kind === "inquiry").length;

  return (
    <div className="cardwrap">
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
      runs={runRows}
      shiftCount={shiftRows.length}
      shiftsPublic={me.shiftsPublic}
      avatarColor={avatarColor(me)}
      showFanView={await fansVisible()}
      discoverable={me.discoverable}
      approveFollowers={me.approveFollowers}
      messagesOpen={me.messagesOpen}
      look={me.look}
    />
    </div>
  );
}
