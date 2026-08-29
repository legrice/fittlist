"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { Icon } from "@/components/Icon";
import { LinkPending } from "@/components/LinkPending";
import { HeaderAccountButton } from "@/components/HeaderAccountButton";
import type { YouAccountData } from "@/components/YouDashboard";
import { activeTab, navTabs, type NavTab } from "@/lib/nav";

export type { NavTab };

// Calendar, discovery, and You live in one thumb-reach dock. Sharing is the
// distinct action beside it, while still opening the persistent share canvas.
export function NavBar({
  active,
  coach = true,
  scheduleHref,
  profileHref,
  face,
  unread = false,
  accountData,
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
  unread?: boolean;
  accountData?: YouAccountData;
}) {
  const here = activeTab(usePathname(), active);
  const tabs = useMemo(() => navTabs(coach, scheduleHref, profileHref), [coach, scheduleHref, profileHref]);
  const dockTabs = tabs;

  return (
    <div className="navwrap">
      <nav className="navbar" aria-label="Main">
        {dockTabs.map((t) => {
          const on = here === t.id;
          if (t.id === "calendar") {
            return <HeaderAccountButton key={t.id} face={face} unread={unread} fallbackHref={profileHref} initialData={accountData} variant="nav" active={on} />;
          }
          const cls = `navtab${on ? " on" : ""}`;
          const inner = (
            <>
              <span className="navglyph">
                <Icon name={t.icon} className={t.id === "share" ? "share-arrow-forward" : undefined} size={24} />
              </span>
              <span className="navlabel">{t.label}</span>
            </>
          );
          return (
            <Link key={t.id} className={cls} data-tab={t.id} href={t.href} aria-label={t.label} aria-current={on ? "page" : undefined}>
              {inner}
              <LinkPending className="tapspin-tab" />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
