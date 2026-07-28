import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Wordmark";

// The same header on every screen of the app: wordmark left, notifications
// and your avatar right. The avatar takes a handler inside the app shell
// (where the account is an overlay) and a link everywhere else.
export function AppHeader({
  unread = 0,
  avatar,
  home = "/feed",
}: {
  unread?: number;
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
}) {
  return (
    <div className="brandbar">
      <Link className="brandbar-home" href={home} aria-label="Home">
        <Wordmark variant="ink" beta />
      </Link>
      <div className="brandbar-actions">
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
