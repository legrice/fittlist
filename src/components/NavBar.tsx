"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { Icon } from "@/components/Icon";
import { LinkPending } from "@/components/LinkPending";
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
  const dockTabs = tabs.filter((tab) => tab.id !== "share");
  const share = tabs.find((tab) => tab.id === "share")!;

  return (
    <div className="navwrap">
      <nav className="navbar" aria-label="Main">
        {dockTabs.map((t) => {
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
      <Link
        className={`navsolo${here === "share" ? " on" : ""}`}
        data-tab="share"
        href={share.href}
        aria-label="Share"
        aria-current={here === "share" ? "page" : undefined}
      >
        <Icon name="reply" className="share-arrow-forward" size={28} />
        <LinkPending className="tapspin-tab" />
      </Link>
    </div>
  );
}
