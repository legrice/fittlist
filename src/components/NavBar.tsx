"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { LinkPending } from "@/components/LinkPending";
import { activeTab, navTabs, type NavTab } from "@/lib/nav";

export type { NavTab };

/** The viewer's own face. It rides the header's top right now rather than a
 *  tab, but the shape is still what a shell hands around. */
export type NavFace = { photo: string | null; color: string; initial: string };

// The whole app in thumb reach: the three screens you move between. Share and
// You both came off, because one is an act and the other is a person, and
// neither is a place. Above 940px this hides and HeaderNav takes over, off the
// same list.
export function NavBar({
  active,
  coach = true,
  scheduleHref,
  face,
}: {
  /** Omit inside the tabs layout: the pathname already says where you are.
   *  A screen off the tabs that belongs to one passes it. */
  active?: NavTab;
  /** Which calendar the Schedule tab points at. */
  coach?: boolean;
  /** Where Schedule goes; defaults by role. */
  scheduleHref?: string;
  /** The viewer's own face, for the Profile tab. A glyph there is the only
   *  tab in the bar naming a thing rather than a place, and a person is not a
   *  thing: your own picture is what every app you already use puts on that
   *  door, and it is the fastest target in the bar to recognise. */
  face?: NavFace;
}) {
  const here = activeTab(usePathname(), active);

  return (
    <nav className="navbar" aria-label="Main">
      {navTabs(coach, scheduleHref).map((t) => {
        const on = here === t.id;
        const cls = `navtab${on ? " on" : ""}`;
        const isMe = t.id === "you" && !!face;
        const inner = (
          <>
            <span className={`navglyph${isMe ? " navglyph-face" : ""}`}>
              {isMe ? (
                face!.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="navface-photo" src={face!.photo} alt="" />
                ) : (
                  <span className="navface-initial" style={{ background: face!.color }}>
                    {face!.initial}
                  </span>
                )
              ) : (
                <Icon name={t.icon} size={26} />
              )}
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
  );
}
