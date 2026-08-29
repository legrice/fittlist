import type { Viewport } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { avatarColor } from "@/lib/avatar";
import { feedbackHost, feedbackPromptDueFor } from "@/lib/feedback";
import { unreadHeaderCounts } from "@/lib/notify";
import { AppHeader } from "@/components/AppHeader";
import { FeedbackPrompt } from "@/components/FeedbackPrompt";
import { InvitesBanner } from "@/components/InvitesBanner";
import { lookMode } from "@/lib/darkmode";
import { adminAttentionCount, adminEmails } from "@/lib/admin";
import { DesktopChrome } from "@/components/DesktopChrome";
import { NavBar } from "@/components/NavBar";
import { currentUser } from "@/lib/current-user";
import { adminActivityFreshSince } from "@/lib/adminactivity";
import { inviteBannerCountFor } from "@/lib/invite-banner";
import { passwordPromptPending } from "@/lib/session";
import { SetPasswordPrompt } from "@/components/SetPasswordPrompt";

export const dynamic = "force-dynamic";

// Safari tints its browser chrome from theme-color. The tabbed app ends in a
// white navigation surface, so matching that color removes the beige seam
// between the site bar and Safari's own bottom controls.
export const viewport: Viewport = { themeColor: "#ffffff" };

type DeferredViewer = {
  id: string;
  email: string;
  createdAt: Date;
  onboardedAt: Date | null;
  feedbackPromptedAt: Date | null;
  invitesBannerAt: Date | null;
};

/** These prompts are useful, but neither is required to navigate or use the
 * calendar. Keeping them behind Suspense lets the signed-in shell and page
 * stream while their uncommon eligibility checks finish. */
async function DeferredInviteBanner({ viewer }: { viewer: DeferredViewer }) {
  return (await inviteBannerCountFor(viewer)) !== 0 ? <InvitesBanner /> : null;
}

async function DeferredFeedbackPrompt({ viewer }: { viewer: DeferredViewer }) {
  const host = await feedbackHost();
  if (!host || !(await feedbackPromptDueFor(viewer, host))) return null;
  return <FeedbackPrompt hostName={host.name.trim() || "We"} />;
}

// The shell the tabbed screens share: header, content, tab bar.
//
// It used to live in each page, which meant three copies of the same user
// query and, worse, chrome that unmounted on every navigation. A layout
// renders once and persists across the loading boundary underneath it, so
// tapping a tab swaps only the content area. The bar you tapped stays put.
export default async function TabsLayout({ children }: { children: React.ReactNode }) {
  const me = await currentUser();
  if (!me) redirect("/");
  const userId = me.id;
  const passwordPromptMode = await passwordPromptPending();

  // A member has a handle too, so the coach shell keys off `kind`.
  const isCoach = me.kind !== "fan" && !!me.handle;
  // In parallel: these are independent, and this layout runs on every tab
  // switch, so awaiting them one by one would stack extra round trips onto every
  // tap of the bar.
  const isAdmin = adminEmails().includes(me.email.toLowerCase());
  const [unread, adminAttention, adminActivityFresh] = await Promise.all([
    unreadHeaderCounts(userId, me.email),
    isAdmin ? adminAttentionCount() : Promise.resolve(0),
    isAdmin ? adminActivityFreshSince(me.adminActivityAt) : Promise.resolve(false),
  ]);
  // The chrome only needs to advertise that something is new. Computing the
  // exact total required six COUNT queries on every navigation for the admin;
  // six indexed existence checks answer the product question with less work.
  const adminActivity = adminActivityFresh ? 1 : 0;
  const deferredViewer: DeferredViewer = {
    id: me.id,
    email: me.email,
    createdAt: me.createdAt,
    onboardedAt: me.onboardedAt,
    feedbackPromptedAt: me.feedbackPromptedAt,
    invitesBannerAt: me.invitesBannerAt,
  };
  // My schedule points at one place now. It used to differ by kind,
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
  const accountData = {
    me: {
      name: me.name.trim() || me.email.split("@")[0],
      handle: me.handle!,
      title: me.title?.trim() ?? "",
      location: me.location?.trim() ?? "",
      photo: face.photo,
      color: face.color,
      coaching: isCoach,
    },
    managed: [],
    shareHref: isCoach ? "/coachshare" : "/membershare",
    isAdmin,
    unread,
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
        adminActivity={adminActivity}
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
          home="/feed"
          admin={isAdmin}
          adminAttention={adminAttention}
          adminActivity={adminActivity}
          face={face}
          profileHref={profileHref}
          accountData={accountData}
          social
        />
        <Suspense fallback={null}>
          <DeferredInviteBanner viewer={deferredViewer} />
        </Suspense>
        {children}
      </div>
      <NavBar
        coach={isCoach}
        scheduleHref={scheduleHref}
        profileHref={profileHref}
        face={face}
        unread={unread.notifications > 0 || unread.messages > 0}
        accountData={accountData}
      />
      <Suspense fallback={null}>
        <DeferredFeedbackPrompt viewer={deferredViewer} />
      </Suspense>
      {passwordPromptMode && <SetPasswordPrompt mode={passwordPromptMode} />}
    </section>
  );
}
