import Link from "next/link";
import { HeaderIconLink } from "@/components/HeaderIconLink";
import { HeaderNav } from "@/components/HeaderNav";
import { Wordmark } from "@/components/Wordmark";
import type { NavTab } from "@/lib/nav";

// The same header on every screen of the app: wordmark left, notifications
// and your avatar right. The avatar is the way to You now that the tab has
// come off the bar, so it carries an href wherever the member side is on; it
// still takes a handler for the one shell where the account is an overlay.
export function AppHeader({
  unread = 0,
  settings,
  avatar,
  home = "/week",
  nav,
}: {
  unread?: number;
  /** Settings, as a gear. Only for a shell with no You tab to hold them:
   *  the coaches-only mode has no tab bar, so the gear is the one door to
   *  the account. Everywhere the tabs render, You is the door and the
   *  corner stays clear. */
  settings?: string;
  avatar?: {
    photo: string | null;
    color: string;
    initial: string;
    onClick?: () => void;
    href?: string;
  };
  /** Where the wordmark goes. The Following tab for anyone with the member
      side, the schedule for a coach who doesn't have it yet. */
  home?: string;
  /** The tabs, as links in the middle of the header, on a screen too wide for
   *  a bottom bar. Pass it wherever the bottom bar renders and omit it where
   *  it doesn't, so the two agree about whether this screen has tabs at all. */
  nav?: { coach?: boolean; active?: NavTab; scheduleHref?: string };
}) {
  return (
    <div className="brandbar">
      <Link className="brandbar-home" href={home} aria-label="Home">
        <Wordmark variant="ink" beta />
      </Link>
      {nav && (
        <HeaderNav
          coach={nav.coach}
          active={nav.active}
          scheduleHref={nav.scheduleHref}
        />
      )}
      <div className="brandbar-actions">
        {/* The bell, your face, and (coaches-only mode) the gear: the corner
            is for what you reach for from anywhere. The magnifier left when
            Discover's tab took that glyph back, and the shield left long
            before it, because a corner of one-off icons fills up. `/search`
            is still behind the directory's own search door. */}
        <HeaderIconLink
          label={`Updates${unread ? `, ${unread} unread` : ""}`}
          icon="notifications"
          href="/updates"
          match="/updates"
          badge={unread > 0 ? <span className="inboxdot">{unread > 9 ? "9+" : unread}</span> : undefined}
        />
        {settings && (
          <HeaderIconLink
            className="settingsbtn"
            label="Settings"
            icon="settings"
            href={settings}
            match="/you"
          />
        )}
        {avatar &&
          (() => {
            const face = avatar.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="usericon-photo" src={avatar.photo} alt="" />
            ) : (
              <span
                className="usericon-initial"
                style={{ background: avatar.color }}
                aria-hidden="true"
              >
                {avatar.initial}
              </span>
            );
            return avatar.href ? (
              <Link className="usericon" aria-label="My page" href={avatar.href}>
                {face}
              </Link>
            ) : (
              <button className="usericon" aria-label="My page" onClick={avatar.onClick}>
                {face}
              </button>
            );
          })()}
      </div>
    </div>
  );
}
