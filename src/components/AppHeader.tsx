import Link from "next/link";
import { HeaderNav } from "@/components/HeaderNav";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Wordmark";
import type { NavTab } from "@/lib/nav";

// The same header on every screen of the app: wordmark left, notifications
// and your avatar right. The avatar takes a handler inside the app shell
// (where the account is an overlay) and a link everywhere else.
export function AppHeader({
  adminNew = null,
  unread = 0,
  weekCount,
  avatar,
  settingsHref,
  onSettings,
  home = "/feed",
  nav,
}: {
  /** null = not an admin; a number shows the door, >0 lights the badge. */
  adminNew?: number | null;
  unread?: number;
  /** Settings, for anyone whose face is already the You tab. A link where the
   *  account is its own route, a handler where it's an overlay. */
  settingsHref?: string;
  onSettings?: () => void;
  /** How many added classes are still ahead. Undefined hides the icon
   *  entirely, for anyone who has no week to keep. */
  weekCount?: number;
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
        {/* Your week: the classes you've added, always one tap away. It sits
            here rather than as a bubble that appears on add, because a control
            that only exists just after you used it can't answer "what have I
            got so far?". The count is what's still ahead, not everything you
            ever added: a number that only grows is a scoreboard. */}
        {adminNew !== null && (
          <Link className="iconbtn inboxbtn adminbtn" aria-label="Admin" href="/admin?activity=1">
            <Icon name="shield" size={20} />
            {adminNew > 0 && <span className="inboxdot">{adminNew > 9 ? "9+" : adminNew}</span>}
          </Link>
        )}
        {weekCount !== undefined && (
          <Link
            className="iconbtn inboxbtn weekbtn"
            aria-label={`Your week${weekCount ? `, ${weekCount} classes` : ", empty"}`}
            href="/week"
          >
            {/* A heart, not a calendar: the things here are saved, and the
                heart on a class is how they got here. */}
            <Icon name="favorite" size={20} />
            {weekCount > 0 && <span className="inboxdot weekdot">{weekCount > 9 ? "9+" : weekCount}</span>}
          </Link>
        )}
        <Link
          className="iconbtn inboxbtn"
          aria-label={`Updates${unread ? `, ${unread} unread` : ""}`}
          href="/updates"
        >
          <Icon name="notifications" size={20} />
          {unread > 0 && <span className="inboxdot">{unread > 9 ? "9+" : unread}</span>}
        </Link>
        {(settingsHref || onSettings) &&
          (settingsHref ? (
            <Link className="iconbtn settingsbtn" aria-label="Settings" href={settingsHref}>
              <Icon name="settings" size={20} />
            </Link>
          ) : (
            <button className="iconbtn settingsbtn" aria-label="Settings" onClick={onSettings}>
              <Icon name="settings" size={20} />
            </button>
          ))}
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
