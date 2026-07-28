"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";

// "none" is the account: reachable from either tab, and neither of them.
export type NavTab = "following" | "discover" | "schedule" | "none";

// The whole app in thumb reach. A member gets the two tabs that mean something
// to them; Schedule is a coach's own week, and they don't have one.
export function NavBar({
  active,
  coach = true,
  onSchedule,
}: {
  active: NavTab;
  /** false drops the Schedule tab: a member has nothing behind it. */
  coach?: boolean;
  // On the schedule screen the account is an overlay on the same route, so
  // Schedule closes it locally rather than routing.
  onSchedule?: () => void;
}) {
  const tabs: { id: NavTab; href: string; icon: string; label: string }[] = [
    { id: "following", href: "/feed", icon: "groups", label: "Following" },
    { id: "discover", href: "/discover", icon: "search", label: "Discover" },
    ...(coach
      ? [{ id: "schedule" as const, href: "/app", icon: "calendar_today", label: "Schedule" }]
      : []),
  ];

  return (
    <nav className="navbar" aria-label="Main">
      {tabs.map((t) => {
        const local = t.id === "schedule" ? onSchedule : undefined;
        const cls = `navtab${active === t.id ? " on" : ""}`;
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
            aria-current={active === t.id ? "page" : undefined}
            onClick={local}
          >
            {inner}
          </button>
        ) : (
          <Link
            key={t.id}
            className={cls}
            href={t.href}
            aria-current={active === t.id ? "page" : undefined}
          >
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}
