import Link from "next/link";
import { HeaderIconLink } from "@/components/HeaderIconLink";
import { HeaderNav } from "@/components/HeaderNav";
import { Wordmark } from "@/components/Wordmark";
import type { NavTab } from "@/lib/nav";

// The same header on every screen of the app: wordmark left, notifications
// and your avatar right. The avatar takes a handler inside the app shell
// (where the account is an overlay) and a link everywhere else.
export function AppHeader({
  unread = 0,
  settings,
  search = false,
  avatar,
  home = "/feed",
  nav,
}: {
  unread?: number;
  /** Settings, as a gear. Only for a shell with no You tab to hold them:
   *  the coaches-only mode has no tab bar, so the gear is the one door to
   *  the account. Everywhere the tabs render, You is the door and the
   *  corner stays clear. */
  settings?: string;
  /** The magnifier, back in the corner now that the plans ribbon left it
   *  room. Only where the member side is on: search is a signed-in door. */
  search?: boolean;
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
      {nav && <HeaderNav coach={nav.coach} active={nav.active} scheduleHref={nav.scheduleHref} />}
      <div className="brandbar-actions">
        {/* The magnifier, the bell, the gear: the corner is for the things
            you reach for from wherever you happen to be. The shield left
            too, once the gear came back: the admin door is a row in the
            account now, and a corner of one-off icons was filling up. */}
        {search && (
          <HeaderIconLink
            className="searchbtn"
            label="Search"
            icon="search"
            href="/search"
            match="/search"
          />
        )}
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
