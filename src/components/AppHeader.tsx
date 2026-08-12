import Link from "next/link";
import { HeaderIconLink } from "@/components/HeaderIconLink";
import { HeaderNav } from "@/components/HeaderNav";
import { SettingsGear } from "@/components/SettingsGear";
import { Wordmark } from "@/components/Wordmark";
import type { NavTab } from "@/lib/nav";

// The same header on every signed-in screen: wordmark left, then Search,
// Notifications and Settings right. Profile already has a permanent tab, so these
// are the three useful actions somebody may need from anywhere in the app.
export function AppHeader({
  unreadNotifications = 0,
  unreadMessages = 0,
  home = "/week",
  nav,
  settings = false,
}: {
  unreadNotifications?: number;
  unreadMessages?: number;
  /** Where the wordmark goes. The Following tab for anyone with the member
      side, the schedule for a coach who doesn't have it yet. */
  home?: string;
  /** The tabs, as links in the middle of the header, on a screen too wide for
   *  a bottom bar. Pass it wherever the bottom bar renders and omit it where
   *  it doesn't, so the two agree about whether this screen has tabs at all. */
  nav?: { coach?: boolean; active?: NavTab; scheduleHref?: string; profileHref?: string };
  /** Settings is contextual to your own profile, not global chrome. */
  settings?: boolean;
}) {
  return (
    <div className="brandbar">
      <Link className="brandbar-home" href={home} aria-label="Home">
        <Wordmark variant="ink" />
      </Link>
      {nav && (
        <HeaderNav
          coach={nav.coach}
          active={nav.active}
          scheduleHref={nav.scheduleHref}
          profileHref={nav.profileHref}
        />
      )}
      <div className="brandbar-actions">
        {/* Search, conversations, then activity: two kinds of attention with
            two distinct jobs, rather than one bell that makes people hunt. */}
        <HeaderIconLink label="Search" icon="search" href="/search" match="/search" />
        <HeaderIconLink
          label={`Messages${unreadMessages ? `, ${unreadMessages} unread` : ""}`}
          icon="chat_bubble"
          href="/updates?tab=messages"
          match="/inbox"
          badge={unreadMessages > 0 ? <span className="inboxdot">{unreadMessages > 9 ? "9+" : unreadMessages}</span> : undefined}
        />
        <HeaderIconLink
          label={`Notifications${unreadNotifications ? `, ${unreadNotifications} unread` : ""}`}
          icon="notifications"
          href="/updates"
          match="/updates"
          badge={unreadNotifications > 0 ? <span className="inboxdot">{unreadNotifications > 9 ? "9+" : unreadNotifications}</span> : undefined}
        />
        {settings && <SettingsGear header />}
      </div>
    </div>
  );
}
