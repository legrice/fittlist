"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { LinkPending } from "@/components/LinkPending";
import { activeTab, navTabs, type NavTab } from "@/lib/nav";

export type { NavTab };

// The whole app in thumb reach. A member gets the two tabs that mean something
// to them; Schedule is a coach's own week, and they don't have one. Above
// 940px this hides and HeaderNav takes over, off the same list.
export function NavBar({
  active,
  coach = true,
  onSchedule,
}: {
  /** Omit inside the tabs layout: the pathname already says where you are.
   *  The schedule passes it, because there the account is an overlay on the
   *  same route and the tab has to stay lit. */
  active?: NavTab;
  /** false drops the Schedule tab: a member has nothing behind it. */
  coach?: boolean;
  // On the schedule screen the account is an overlay on the same route, so
  // Schedule closes it locally rather than routing.
  onSchedule?: () => void;
}) {
  const here = activeTab(usePathname(), active);

  return (
    <nav className="navbar" aria-label="Main">
      {navTabs(coach).map((t) => {
        const local = t.id === "schedule" ? onSchedule : undefined;
        const cls = `navtab${here === t.id ? " on" : ""}`;
        const inner = (
          <>
            <Icon name={t.icon} size={26} />
            <span>{t.label}</span>
          </>
        );
        return local ? (
          <button
            key={t.id}
            type="button"
            className={cls}
            aria-current={here === t.id ? "page" : undefined}
            onClick={local}
          >
            {inner}
          </button>
        ) : (
          <Link
            key={t.id}
            className={cls}
            href={t.href}
            aria-current={here === t.id ? "page" : undefined}
          >
            {inner}
            <LinkPending className="tapspin-tab" />
          </Link>
        );
      })}
    </nav>
  );
}
