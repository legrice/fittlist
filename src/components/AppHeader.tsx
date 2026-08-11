import Link from "next/link";
import { HeaderIconLink } from "@/components/HeaderIconLink";
import { HeaderNav } from "@/components/HeaderNav";
import { SettingsGear } from "@/components/SettingsGear";
import { Wordmark } from "@/components/Wordmark";
import type { NavTab } from "@/lib/nav";

// The same header on every signed-in screen: wordmark left, then Search,
// Messages and Settings right. Profile already has a permanent tab, so these
// are the three useful actions somebody may need from anywhere in the app.
export function AppHeader({
  home = "/week",
  nav,
}: {
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
        {/* One stable utility order everywhere in the signed-in app. Search
            finds coaches and classes, Messages holds conversations, and the
            gear opens the viewer's own settings without leaving the page. */}
        <HeaderIconLink label="Search" icon="search" href="/search" match="/search" />
        <HeaderIconLink
          label="Messages"
          icon="chat_bubble"
          href="/inbox"
          match="/inbox"
        />
        <SettingsGear header />
      </div>
    </div>
  );
}
