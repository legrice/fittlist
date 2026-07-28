"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";

export type NavTab = "home" | "discover" | "schedule";

// The whole app in thumb reach. Only the coach shell has it, and only once the
// member side is switched on — before that there's nothing to switch between.
export function NavBar({
  active,
  onSchedule,
}: {
  active: NavTab;
  // On the schedule screen the account is an overlay on the same route, so
  // Schedule closes it locally rather than routing.
  onSchedule?: () => void;
}) {
  const tabs: { id: NavTab; href: string; icon: string; label: string }[] = [
    { id: "home", href: "/feed", icon: "home", label: "Home" },
    { id: "discover", href: "/discover", icon: "search", label: "Discover" },
    { id: "schedule", href: "/app", icon: "calendar_today", label: "Schedule" },
  ];

  return (
    <nav className="navbar" aria-label="Main">
      {tabs.map((t) => {
        const local = t.id === "schedule" ? onSchedule : undefined;
        const cls = `navtab${active === t.id ? " on" : ""}`;
        const inner = (
          <>
            <Icon name={t.icon} size={30} />
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
