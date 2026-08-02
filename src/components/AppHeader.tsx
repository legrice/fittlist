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
  search = true,
  plans,
  avatar,
  home = "/feed",
  nav,
}: {
  /** null = not an admin; a number shows the door, >0 lights the badge. */
  adminNew?: number | null;
  unread?: number;
  /** The magnifier. On by default: search is something you do from wherever
   *  you are, so the corner is where it belongs. Off for a shell that has no
   *  member side to search. */
  search?: boolean;
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
          <Link className="iconbtn inboxbtn adminbtn" aria-label="Admin" href="/admin?activity=1">
            <Icon name="shield" size={20} />
            {adminNew > 0 && <span className="inboxdot">{adminNew > 9 ? "9+" : adminNew}</span>}
          </Link>
        )}
        {/* The ribbon, the magnifier, the bell: the corner is for the things
            you reach for from wherever you happen to be, and your plans are
            the first of those. */}
        {plans !== undefined && (
          <Link
            className="iconbtn inboxbtn plansbtn"
            aria-label={`Your plans${plans ? `, ${plans} coming up` : ""}`}
            href="/week"
          >
            <Icon name="bookmark" size={20} />
            {plans > 0 && <span className="inboxdot plansdot">{plans > 9 ? "9+" : plans}</span>}
          </Link>
        )}
        {search && (
          <Link className="iconbtn inboxbtn searchbtn" aria-label="Search" href="/search">
            <Icon name="search" size={20} />
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
