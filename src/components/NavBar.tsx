"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { Icon } from "@/components/Icon";
import { LinkPending } from "@/components/LinkPending";
import { activeTab, navTabs, type NavTab } from "@/lib/nav";

export type { NavTab };

// The whole app in thumb reach: the screens you move between, and nothing
// else. The Slack-style dock (the pill plus a search circle beside it) was
// tried twice now and reverted twice, the second time by Matt after living
// with it. Discover is a normal tab pointing at the same search as the header
// magnifier, and this stays one plain pill. The desktop chrome takes over at
// larger widths from the same shared list.
export function NavBar({
  active,
  coach = true,
  scheduleHref,
  profileHref,
  face,
}: {
  /** Omit inside the tabs layout: the pathname already says where you are.
   *  A screen off the tabs that belongs to one passes it. */
  active?: NavTab;
  /** Which calendar the Schedule tab points at. */
  coach?: boolean;
  /** Where Schedule goes; defaults by role. */
  scheduleHref?: string;
  /** Where Profile goes: your own page. Defaults to /you, which redirects. */
  profileHref?: string;
  face?: { photo: string | null; color: string; initial: string };
}) {
  const here = activeTab(usePathname(), active);
  const tabs = useMemo(() => navTabs(coach, scheduleHref, profileHref), [coach, scheduleHref, profileHref]);

  return (
    <div className="navwrap">
      <nav className="navbar" aria-label="Main">
        {tabs.map((t) => {
          const on = here === t.id;
          const cls = `navtab${on ? " on" : ""}`;
          const inner = (
            <>
              <span className="navglyph">
                {t.id === "calendar" && face ? (
                  face.photo ? <img className="navav" src={face.photo} alt="" /> : (
                    <span className="navav navav-empty" style={{ background: face.color }}>{face.initial}</span>
                  )
                ) : <Icon name={t.icon} size={22} />}
              </span>
              <span>{t.label}</span>
            </>
          );
          return (
            <Link key={t.id} className={cls} data-tab={t.id} href={t.href} aria-current={on ? "page" : undefined}>
              {inner}
              <LinkPending className="tapspin-tab" />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
