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
  const unread = await unreadNotifications(userId);
  const week = await weekCount(userId);
  // "How is it going?", once they have been here long enough to know.
  const askFeedback = (await feedbackPromptDue(userId)) ? await feedbackHost() : null;
  const invitesLeft = await invitesBannerCount();

  return (
    <section className="screen hasnav" data-mode={me.look === "dark" ? "dark" : undefined}>
      <div className="pad">
        <AppHeader
          unread={unread}
          weekCount={week}
          nav={{ coach: isCoach }}
          avatar={{
            photo: me.photo,
            color: avatarColor(me),
            initial: ((me.name.trim() || me.email).charAt(0) || "?").toUpperCase(),
            href: isCoach ? "/app?acct=1" : "/you",
          }}
        />
        {invitesLeft > 0 && <InvitesBanner left={invitesLeft} />}
        {children}
      </div>
      <NavBar coach={isCoach} />
      {askFeedback && <FeedbackPrompt hostName={askFeedback.name.trim() || "We"} />}
    </section>
  );
}
