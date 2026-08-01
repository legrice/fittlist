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
  youHref,
  onYou,
  plans,
}: {
  /** Omit inside the tabs layout: the pathname already says where you are.
   *  The schedule passes it, because there the account is an overlay on the
   *  same route and the tab has to stay lit. */
  active?: NavTab;
  /** false drops the You tab: a member has nothing behind it. */
  coach?: boolean;
  /** Photo or initial for the You tab. Without it the tab falls back to its
   *  icon, which is what a screen that doesn't know who you are should do. */
  face?: NavFace;
  /** Where You goes. A coach's public page; defaults by role. */
  youHref?: string;
  // On the schedule screen settings is an overlay on the same route, so You
  // closes it locally rather than routing.
  onYou?: () => void;
  /** How many added classes are still ahead. It rode on the header's heart
   *  until Plans became a tab. A count of what's coming, not of everything
   *  ever added: a number that only grows is a scoreboard. */
  plans?: number;
}) {
  const here = activeTab(usePathname(), active);

  return (
    <nav className="navbar" aria-label="Main">
      {navTabs(coach, youHref).map((t) => {
        const local = t.id === "you" ? onYou : undefined;
        const on = here === t.id;
        const cls = `navtab${on ? " on" : ""}`;
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
        const count = t.id === "plans" ? plans : undefined;
        const inner = (
          <>
            <span className="navglyph">
              {glyph}
              {!!count && <span className="navdot">{count > 9 ? "9+" : count}</span>}
            </span>
            <span>{t.label}</span>
          </>
        );
        return local ? (
          <button
            key={t.id}
            type="button"
            className={cls}
            data-tab={t.id}
            aria-current={on ? "page" : undefined}
            onClick={local}
          >
            {inner}
          </button>
        ) : (
          <Link key={t.id} className={cls} data-tab={t.id} href={t.href} aria-current={on ? "page" : undefined}>
            {inner}
            <LinkPending className="tapspin-tab" />
          </Link>
        );
      })}
    </nav>
  );
}
