import Link from "next/link";
import { HeaderFind } from "@/components/HeaderFind";
import { HeaderIconLink } from "@/components/HeaderIconLink";
import { HeaderNav } from "@/components/HeaderNav";
import { Wordmark } from "@/components/Wordmark";
import type { NavTab } from "@/lib/nav";

// The same header on every screen of the app: wordmark left, the magnifier and
// the bell right. The corner held your own face for a while, as the way to
// You; the Profile tab wears the face now and opens the same page, so that was
// a second door to somewhere that already had one. What the corner is for is
// the thing you reach for from anywhere, and on this app that is finding a
// coach, because every other screen is empty until a follow happens.
export function AppHeader({
  unread = 0,
  settings,
  find = false,
  home = "/week",
  nav,
}: {
  unread?: number;
  /** Settings, as a gear. Only for a shell with no You tab to hold them:
   *  the coaches-only mode has no tab bar, so the gear is the one door to
   *  the account. Everywhere the tabs render, You is the door and the
   *  corner stays clear. */
  settings?: string;
  /** The magnifier, opening the directory as a sheet. Off in the shell with
   *  no member side at all, where there is nobody to find. */
  find?: boolean;
  /** Where the wordmark goes. The Following tab for anyone with the member
      side, the schedule for a coach who doesn't have it yet. */
  home?: string;
  /** The tabs, as links in the middle of the header, on a screen too wide for
   *  a bottom bar. Pass it wherever the bottom bar renders and omit it where
   *  it doesn't, so the two agree about whether this screen has tabs at all. */
  nav?: { coach?: boolean; active?: NavTab; scheduleHref?: string; profileHref?: string };
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
          profileHref={nav.profileHref}
        />
      )}
      <div className="brandbar-actions">
        {/* Find, the bell, and (coaches-only mode) the gear. Two icons is the
            budget: a corner of one-off icons fills up, and the shield and the
            face both left it for that reason. `/search` is still behind the
            directory's own search door. */}
        {find && <HeaderFind />}
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
            match="/settings"
          />
        )}
      </div>
    </div>
  );
}
