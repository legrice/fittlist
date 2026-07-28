"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";

export type NavTab = "home" | "discover" | "schedule" | "you";

// The whole app in thumb reach. Only the coach shell has it, and only once the
// member side is switched on — before that there's nothing to switch between.
export function NavBar({
  active,
  photo,
  color,
  initial,
  onSchedule,
  onYou,
}: {
  active: NavTab;
  photo: string | null;
  color: string;
  initial: string;
  // On the schedule screen, Schedule and You are the same route — the account
  // is an overlay, not a page — so those tabs act locally instead of routing.
  onSchedule?: () => void;
  onYou?: () => void;
}) {
  const tabs: { id: NavTab; href: string; icon: string; label: string }[] = [
    { id: "home", href: "/feed", icon: "home", label: "Home" },
    { id: "discover", href: "/discover", icon: "search", label: "Discover" },
    { id: "schedule", href: "/app", icon: "calendar_today", label: "Schedule" },
    { id: "you", href: "/app?acct=1", icon: "account_circle", label: "You" },
  ];

  return (
    <nav className="navbar" aria-label="Main">
      {tabs.map((t) => {
        const local = t.id === "schedule" ? onSchedule : t.id === "you" ? onYou : undefined;
        const cls = `navtab${active === t.id ? " on" : ""}`;
        const inner = (
          <>
            {t.id === "you" ? (
              // Your face is the tab — it's the clearest possible label for it.
              photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="navav" src={photo} alt="" />
              ) : (
                <span className="navav navav-empty" style={{ background: color }} aria-hidden="true">
                  {initial}
                </span>
              )
            ) : (
              <Icon name={t.icon} size={22} />
            )}
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
