import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Wordmark";

// The same header on every screen of the app: wordmark left, notifications
// right. Identity lives in the You tab now — except with no bottom nav (the
// coach beta), where the header avatar is still the only way into the account.
export function AppHeader({
  unread = 0,
  avatar,
}: {
  unread?: number;
  avatar?: { photo: string | null; color: string; initial: string; onClick: () => void };
}) {
  return (
    <div className="brandbar">
      <Wordmark variant="ink" beta />
      <div className="brandbar-actions">
        <Link
          className="iconbtn inboxbtn"
          aria-label={`Updates${unread ? `, ${unread} unread` : ""}`}
          href="/updates"
        >
          <Icon name="notifications" size={20} />
          {unread > 0 && <span className="inboxdot">{unread > 9 ? "9+" : unread}</span>}
        </Link>
        {avatar && (
          <button className="usericon" aria-label="My page" onClick={avatar.onClick}>
            {avatar.photo ? (
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
            )}
          </button>
        )}
      </div>
    </div>
  );
}
