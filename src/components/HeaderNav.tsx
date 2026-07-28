"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LinkPending } from "@/components/LinkPending";
import { activeTab, navTabs, type NavTab } from "@/lib/nav";

// The tab bar, as header links, on a wide screen.
//
// The bottom bar is thumb reach, which a mouse doesn't have and a desktop
// window makes absurd: it hides at 940px, and until now took the whole app's
// navigation with it. Same places, same active state, no icons. Words are
// enough when there's room for them and nothing is competing for the corner.
export function HeaderNav({
  coach = true,
  active,
  onSchedule,
}: {
  coach?: boolean;
  /** Passed on the schedule, where the account is an overlay on the same route
   *  and the link has to stay lit while it's open. */
  active?: NavTab;
  /** There, Schedule closes the overlay rather than routing. */
  onSchedule?: () => void;
}) {
  const here = activeTab(usePathname(), active);

  return (
    <nav className="headnav" aria-label="Main">
      {navTabs(coach).map((t) => {
        const cls = `headnav-l${here === t.id ? " on" : ""}`;
        const current = here === t.id ? "page" : undefined;
        return t.id === "schedule" && onSchedule ? (
          <button key={t.id} type="button" className={cls} aria-current={current} onClick={onSchedule}>
            {t.label}
          </button>
        ) : (
          <Link key={t.id} className={cls} href={t.href} aria-current={current}>
            {t.label}
            <LinkPending className="tapspin-head" />
          </Link>
        );
      })}
    </nav>
  );
}
