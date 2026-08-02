import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { invitesBannerCount } from "@/app/actions/invites";
import { feedbackHost, feedbackPromptDue } from "@/lib/feedback";
import { unreadNotifications } from "@/lib/notify";
import { getSessionUserId } from "@/lib/session";
import { AppHeader } from "@/components/AppHeader";
import { FeedbackPrompt } from "@/components/FeedbackPrompt";
import { InvitesBanner } from "@/components/InvitesBanner";
import { NavBar } from "@/components/NavBar";

export const dynamic = "force-dynamic";

// The shell the tabbed screens share: header, content, tab bar.
//
// It used to live in each page, which meant three copies of the same user
// query and, worse, chrome that unmounted on every navigation. A layout
// renders once and persists across the loading boundary underneath it, so
// tapping a tab swaps only the content area. The bar you tapped stays put.
export default async function TabsLayout({ children }: { children: React.ReactNode }) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) redirect("/");

  // A member has a handle too, so the coach shell keys off `kind`.
  const isCoach = me.kind !== "fan" && !!me.handle;
  // In parallel: these are independent, and this layout runs on every tab
  // switch, so awaiting them one by one stacked four round trips onto every
  // tap of the bar.
  const [unread, promptDue, invitesLeft] = await Promise.all([
    unreadNotifications(userId),
    feedbackPromptDue(userId),
    invitesBannerCount(),
  ]);
  // "How is it going?", once they have been here long enough to know.
  const askFeedback = promptDue ? await feedbackHost() : null;
  // The Schedule tab is the working calendar: a coach's at /app, a member's
  // at /week. You is the person, at /you for everyone.
  const scheduleHref = isCoach ? "/app" : "/week";
  const face = {
    photo: me.photo,
    color: avatarColor(me),
    initial: ((me.name.trim() || me.email).charAt(0) || "?").toUpperCase(),
  };

  return (
    <section className="screen hasnav" data-mode={me.look === "dark" ? "dark" : undefined}>
      <div className="pad">
        <AppHeader
          unread={unread}
          // Every screen in this group is the member side, so the magnifier
          // is always right here. No gear: the You tab is the door to the
          // account now, and a second door in the corner said it twice.
          search
          nav={{ coach: isCoach, scheduleHref }}
        />
        {invitesLeft !== 0 && <InvitesBanner />}
        {children}
      </div>
      <NavBar coach={isCoach} face={face} scheduleHref={scheduleHref} />
      {askFeedback && <FeedbackPrompt hostName={askFeedback.name.trim() || "We"} />}
    </section>
  );
}
