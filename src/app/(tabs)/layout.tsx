import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { invitesBannerCount } from "@/app/actions/invites";
import { feedbackHost, feedbackPromptDue } from "@/lib/feedback";
import { unreadNotifications } from "@/lib/notify";
import { weekCount } from "@/lib/week";
import { getSessionUserId } from "@/lib/session";
import { AppHeader } from "@/components/AppHeader";
import { adminEmails } from "@/lib/admin";
import { adminNewActivityCount } from "@/lib/adminactivity";
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
  const isAdmin = adminEmails().includes(me.email.toLowerCase());
  const [unread, week, promptDue, invitesLeft, adminNew] = await Promise.all([
    unreadNotifications(userId),
    weekCount(userId),
    feedbackPromptDue(userId),
    invitesBannerCount(),
    isAdmin ? adminNewActivityCount(userId) : Promise.resolve(null),
  ]);
  // "How is it going?", once they have been here long enough to know.
  const askFeedback = promptDue ? await feedbackHost() : null;
  const youHref = isCoach ? `/${me.handle}` : "/you";
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
          weekCount={week}
          adminNew={adminNew}
          nav={{ coach: isCoach, youHref }}
          // The same corner for everyone: your week, the bell, settings. The
          // face left it when it became the You tab.
        />
        {invitesLeft !== 0 && <InvitesBanner />}
        {children}
      </div>
      <NavBar coach={isCoach} face={face} youHref={youHref} />
      {askFeedback && <FeedbackPrompt hostName={askFeedback.name.trim() || "We"} />}
    </section>
  );
}
