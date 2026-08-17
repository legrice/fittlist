import Link from "next/link";
import { HeaderIconLink } from "@/components/HeaderIconLink";
import { HeaderNav } from "@/components/HeaderNav";
import { Wordmark } from "@/components/Wordmark";
import type { NavTab } from "@/lib/nav";

type HeaderFace = { photo: string | null; color: string; initial: string };

// The same compact header on every signed-in screen: wordmark left, then
// search and the viewer's account. New messages and notifications collapse
// into one activity dot on the avatar instead of competing with the calendar.
export function AppHeader({
  notificationUnread = 0,
  messageUnread = 0,
  home = "/calendar",
  nav,
  settings = false,
  admin = false,
  adminAttention = 0,
  face,
  profileHref = "/you",
}: {
  notificationUnread?: number;
  messageUnread?: number;
  /** Where the wordmark goes. The calendar is the signed-in front door. */
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
  face?: HeaderFace;
  profileHref?: string;
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
        <HeaderIconLink label="Search" icon="search" href="/search" match="/search" />
        <Link className="brandbar-avatar" href={profileHref} aria-label={`Your profile${notificationUnread || messageUnread ? ", new activity" : ""}`}>
          {face?.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={face.photo} alt="" />
          ) : (
            <span style={{ background: face?.color ?? "var(--color-surface-muted)" }}>{face?.initial ?? "?"}</span>
          )}
          {(notificationUnread > 0 || messageUnread > 0) && <i aria-hidden="true" />}
        </Link>
      </div>
    </div>
  );
}
