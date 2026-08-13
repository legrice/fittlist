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
import { NavBar } from "@/components/NavBar";
import { lookMode } from "@/lib/darkmode";

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
  const [unread, promptDue, invitesLeft] = await Promise.all([
    unreadHeaderCounts(userId, me.email),
    feedbackPromptDue(userId),
    invitesBannerCount(),
  ]);
  // "How is it going?", once they have been here long enough to know.
  const askFeedback = promptDue ? await feedbackHost() : null;
  // The Calendar tab points at one place now. It used to differ by kind,
  // because a coach's calendar was /app and a member had their own at /week;
  // a member has no calendar at all, so there is nothing to fork on and the
  // tab is not drawn for them in the first place.
  const scheduleHref = "/calendar";
  // Profile opens your page, which is your handle. /you redirects there and is
  // the fallback for an account still mid-signup with no handle to point at.
  const profileHref = me.handle ? `/${me.handle}` : "/you";
  const face = {
    photo: me.photoThumb ?? me.photo,
    color: avatarColor(me),
    initial: ((me.name.trim() || me.email).charAt(0) || "?").toUpperCase(),
  };

  return (
    <section className="screen hasnav" data-mode={lookMode(me.look)}>
      <div className="pad">
        <AppHeader
          notificationUnread={unread.notifications}
          messageUnread={unread.messages}
          // The wordmark goes Home, by Matt's call: /feed is the front
          // door for everyone now, whatever landingHref answers for
          // sign-in.
          home="/feed"
          nav={{ coach: isCoach, scheduleHref, profileHref }}
        />
        {invitesLeft !== 0 && <InvitesBanner />}
        {children}
      </div>
      {/* The Profile tab wears the viewer's own face rather than a glyph: it
          is the only tab naming a person rather than a place, and a picture is
          both the fastest thing in the bar to recognise and what every app
          anybody already uses puts on that door. */}
      <NavBar
        coach={isCoach}
        scheduleHref={scheduleHref}
        profileHref={profileHref}
        face={face}
      />
      {askFeedback && <FeedbackPrompt hostName={askFeedback.name.trim() || "We"} />}
    </section>
  );
}
