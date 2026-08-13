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
  notificationUnread = 0,
  messageUnread = 0,
  home = "/week",
  nav,
  settings = false,
  admin = false,
  adminAttention = 0,
}: {
  notificationUnread?: number;
  messageUnread?: number;
  /** Where the wordmark goes. The Following tab for anyone with the member
      side, the schedule for a coach who doesn't have it yet. */
  home?: string;
  /** The tabs, as links in the middle of the header, on a screen too wide for
   *  a bottom bar. Pass it wherever the bottom bar renders and omit it where
   *  it doesn't, so the two agree about whether this screen has tabs at all. */
  nav?: { coach?: boolean; active?: NavTab; scheduleHref?: string; profileHref?: string };
  /** Settings is contextual to your own profile rather than global chrome. */
  settings?: boolean;
  /** Site operations are visible only to configured admins. */
  admin?: boolean;
  /** Number of unresolved reported listings. */
  adminAttention?: number;
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
        {/* Admin first when present, then search, conversations and activity. */}
        {admin && (
          <HeaderIconLink
            label={`Admin${adminAttention ? `, ${adminAttention} unresolved ${adminAttention === 1 ? "report" : "reports"}` : ""}`}
            icon="admin_panel_settings"
            href="/admin"
            match="/admin"
            badge={adminAttention > 0 ? <span className="inboxdot">{adminAttention > 9 ? "9+" : adminAttention}</span> : undefined}
          />
        )}
        <HeaderIconLink label="Search" icon="search" href="/search" match="/search" />
        <HeaderIconLink
          label={`Messages${messageUnread ? `, ${messageUnread} unread` : ""}`}
          icon="chat_bubble"
          href="/inbox"
          match="/inbox"
          badge={messageUnread > 0 ? <span className="inboxdot">{messageUnread > 9 ? "9+" : messageUnread}</span> : undefined}
        />
        <HeaderIconLink
          label={`Notifications${notificationUnread ? `, ${notificationUnread} unread` : ""}`}
          icon="notifications"
          href="/notifications"
          match="/notifications"
          badge={notificationUnread > 0 ? <span className="inboxdot">{notificationUnread > 9 ? "9+" : notificationUnread}</span> : undefined}
        />
        {settings && <SettingsGear header />}
      </div>
    </div>
  );
}
