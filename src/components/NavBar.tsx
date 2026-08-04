"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { LinkPending } from "@/components/LinkPending";
import { activeTab, navTabs, type NavTab } from "@/lib/nav";

export type { NavTab };

/** The viewer's own face, for the You tab. */
export type NavFace = { photo: string | null; color: string; initial: string };

// The whole app in thumb reach. A member gets the two tabs that mean something
// to them; You is a coach's own page, and they don't have one. Above 940px this
// hides and HeaderNav takes over, off the same list.
export function NavBar({
  active,
  coach = true,
  face,
  scheduleHref,
}: {
  /** Omit inside the tabs layout: the pathname already says where you are.
   *  A screen off the tabs that belongs to one passes it. */
  active?: NavTab;
  /** Which calendar the Schedule tab points at. */
  coach?: boolean;
  /** Photo or initial for the You tab. Without it the tab falls back to its
   *  icon, which is what a screen that doesn't know who you are should do. */
  face?: NavFace;
  /** Where Schedule goes; defaults by role. */
  scheduleHref?: string;
}) {
  const here = activeTab(usePathname(), active);

  return (
    <nav className="navbar" aria-label="Main">
      {navTabs(coach, scheduleHref).map((t) => {
        const on = here === t.id;
        const cls = `navtab${on ? " on" : ""}${t.center ? " navtab-center" : ""}`;
        const glyph =
          t.face && face ? (
            face.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="navav" src={face.photo} alt="" />
            ) : (
              <span className="navav navav-empty" style={{ background: face.color }} aria-hidden="true">
                {face.initial}
              </span>
            )
          ) : (
            <Icon name={t.icon} size={26} />
          );
        const inner = (
          <>
            <span className="navglyph">{glyph}</span>
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
  );
}
