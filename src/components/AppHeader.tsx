import Link from "next/link";
import { HeaderIconLink } from "@/components/HeaderIconLink";
import { HeaderNav } from "@/components/HeaderNav";
import { Wordmark } from "@/components/Wordmark";
import type { NavTab } from "@/lib/nav";

// The same header on every screen of the app: wordmark left, notifications
// and your avatar right. The avatar takes a handler inside the app shell
// (where the account is an overlay) and a link everywhere else.
export function AppHeader({
  adminNew = null,
  unread = 0,
  settings,
  plans,
  avatar,
  home = "/feed",
  nav,
}: {
  /** null = not an admin; a number shows the door, >0 lights the badge. */
  adminNew?: number | null;
  unread?: number;
  /** Settings, as a gear. The href because the account view lives behind a
   *  URL (/app?acct=1); omit for anyone whose settings live on a tab. */
  settings?: string;
  /** Your plans, as the ribbon with how many are still ahead. A number shows
   *  the door; omit it for a shell with no member side. It tried being the
   *  first tab, and a fourth tab crowded the bar for a list you visit rather
   *  than live on; the corner is where it started and where it belongs. */
  plans?: number;
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
  nav?: { coach?: boolean; active?: NavTab; youHref?: string; onYou?: () => void };
}) {
  return (
    <div className="brandbar">
      <Link className="brandbar-home" href={home} aria-label="Home">
        <Wordmark variant="ink" beta />
      </Link>
      {nav && <HeaderNav coach={nav.coach} active={nav.active} youHref={nav.youHref} onYou={nav.onYou} />}
      <div className="brandbar-actions">
        {adminNew !== null && (
          <HeaderIconLink
            className="adminbtn"
            label="Admin"
            icon="shield"
            href="/admin?activity=1"
            match="/admin"
            badge={
              adminNew > 0 ? (
                <span className="inboxdot">{adminNew > 9 ? "9+" : adminNew}</span>
              ) : undefined
            }
          />
        )}
        {/* The ribbon, the bell, the gear: the corner is for the things you
            reach for from wherever you happen to be. The magnifier moved onto
            the Discover tab, where searching starts; two doors to one search
            said one thing twice. */}
        {plans !== undefined && (
          <HeaderIconLink
            className="plansbtn"
            label={`Your plans${plans ? `, ${plans} coming up` : ""}`}
            icon="bookmark"
            href="/week"
            match="/week"
            badge={
              plans > 0 ? (
                <span className="inboxdot plansdot">{plans > 9 ? "9+" : plans}</span>
              ) : undefined
            }
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
            match="?acct"
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
