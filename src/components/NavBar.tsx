"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";

export type NavTab = "schedule" | "following" | "you";

// The two halves of the app plus your identity, in thumb reach. Only the
// coach shell has it, and only once the member side is switched on — before
// that there's nothing to switch between.
export function NavBar({
  active,
  onSchedule,
  onYou,
}: {
  active: NavTab;
  // On the schedule screen, Schedule and You are the same route — the account
  // is an overlay, not a page — so those tabs act locally instead of routing.
  onSchedule?: () => void;
  onYou?: () => void;
}) {
  const tabs: { id: NavTab; href: string; icon: string; label: string }[] = [
    { id: "schedule", href: "/app", icon: "calendar_today", label: "Schedule" },
    { id: "following", href: "/feed", icon: "groups", label: "Following" },
    { id: "you", href: "/app?acct=1", icon: "account_circle", label: "You" },
  ];

  return (
    <nav className="navbar" aria-label="Main">
      {tabs.map((t) => {
        const local = t.id === "schedule" ? onSchedule : t.id === "you" ? onYou : undefined;
        const cls = `navtab${active === t.id ? " on" : ""}`;
        const inner = (
          <>
            <Icon name={t.icon} size={22} />
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
