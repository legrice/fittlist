import { eq } from "drizzle-orm";
import type { Viewport } from "next";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { invitesBannerCount } from "@/app/actions/invites";
import { feedbackHost, feedbackPromptDue } from "@/lib/feedback";
import { unreadHeaderCounts } from "@/lib/notify";
import { getSessionUserId } from "@/lib/session";
import { AppHeader } from "@/components/AppHeader";
import { FeedbackPrompt } from "@/components/FeedbackPrompt";
import { InvitesBanner } from "@/components/InvitesBanner";
import { lookMode } from "@/lib/darkmode";
import { adminAttentionCount, adminEmails } from "@/lib/admin";
import { DesktopChrome } from "@/components/DesktopChrome";
import { NavBar } from "@/components/NavBar";

export const dynamic = "force-dynamic";

// Safari tints its browser chrome from theme-color. The tabbed app ends in a
// white navigation surface, so matching that color removes the beige seam
// between the site bar and Safari's own bottom controls.
export const viewport: Viewport = { themeColor: "#ffffff" };

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
  // switch, so awaiting them one by one would stack extra round trips onto every
  // tap of the bar.
  const isAdmin = adminEmails().includes(me.email.toLowerCase());
  const [unread, promptDue, invitesLeft, adminAttention] = await Promise.all([
    unreadHeaderCounts(userId, me.email),
    feedbackPromptDue(userId),
    invitesBannerCount(),
    isAdmin ? adminAttentionCount() : Promise.resolve(0),
  ]);
  // "How is it going?", once they have been here long enough to know.
  const askFeedback = promptDue ? await feedbackHost() : null;
  // The Calendar tab points at one place now. It used to differ by kind,
  // because a coach's calendar was /app and a member had their own at /week;
  // a member has no calendar at all, so there is nothing to fork on and the
  // tab is not drawn for them in the first place.
  const scheduleHref = "/calendar";
  // You is the private account dashboard. The public page remains available
  // from Preview profile inside it; mixing those two surfaces made editing,
  // favorites and settings feel like public-profile content.
  const profileHref = "/you";
  const face = {
    photo: me.photoThumb ?? me.photo,
    color: avatarColor(me),
    initial: ((me.name.trim() || me.email).charAt(0) || "?").toUpperCase(),
  };

  return (
    <section className="screen hasnav" data-mode={lookMode(me.look)}>
      <DesktopChrome
        coach={isCoach}
        scheduleHref={scheduleHref}
        profileHref={profileHref}
        notificationUnread={unread.notifications}
        messageUnread={unread.messages}
        admin={isAdmin}
        adminAttention={adminAttention}
        person={{
          name: me.name.trim() || me.email.split("@")[0],
          location: me.location,
          photo: me.photoThumb ?? me.photo,
          color: face.color,
          initial: face.initial,
        }}
      />
      <div className="pad">
        <AppHeader
          notificationUnread={unread.notifications}
          messageUnread={unread.messages}
          home="/calendar"
          admin={isAdmin}
          adminAttention={adminAttention}
          face={face}
          profileHref={profileHref}
        />
        {invitesLeft !== 0 && <InvitesBanner />}
        {children}
      </div>
      <NavBar coach={isCoach} scheduleHref={scheduleHref} profileHref={profileHref} />
      {askFeedback && <FeedbackPrompt hostName={askFeedback.name.trim() || "We"} />}
    </section>
  );
}
