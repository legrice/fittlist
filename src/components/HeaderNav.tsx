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
  scheduleHref,
  profileHref,
}: {
  coach?: boolean;
  /** Light a tab the pathname alone can't name: your own profile is You. */
  active?: NavTab;
  /** Where Schedule goes; defaults by role. */
  scheduleHref?: string;
  profileHref?: string;
  /** Whether Home is one of the links. Dark-launched; the server says. */
}) {
  const here = activeTab(usePathname(), active);

  return (
    <nav className="headnav" aria-label="Main">
      {navTabs(coach, scheduleHref, profileHref)
        // Share is a real link up here (/share, the picture editor) where the
        // bar below opens it as a hub: a desktop has no thumb to hold a sheet
        // under, and the editor is where the rows in it mostly lead.
        .map((t) => {
        const cls = `headnav-l${here === t.id ? " on" : ""}`;
        const current = here === t.id ? "page" : undefined;
        return (
          <Link key={t.id} className={cls} href={t.href} aria-current={current}>
            {t.label}
            <LinkPending className="tapspin-head" />
          </Link>
        );
      })}
    </nav>
  );
}
