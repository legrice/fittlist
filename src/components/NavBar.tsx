"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DiscoverSheet } from "@/components/DiscoverSheet";
import { Icon } from "@/components/Icon";
import { LinkPending } from "@/components/LinkPending";
import { activeTab, navTabs, type NavTab } from "@/lib/nav";

export type { NavTab };

/** The viewer's own face. It rides the header's top right now rather than a
 *  tab, but the shape is still what a shell hands around. */
export type NavFace = { photo: string | null; color: string; initial: string };

// The whole app in thumb reach, laid out the way Photos lays its dock: the
// pill of places on the left, and search in its own circle on the right,
// separate because finding somebody is an act rather than a place and the
// pill is for the screens you move between. Above 940px this hides and
// HeaderNav takes over, off the same list.
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
  /** The viewer's own face, for the Profile tab. A glyph there is the only
   *  tab in the bar naming a thing rather than a place, and a person is not a
   *  thing: your own picture is what every app you already use puts on that
   *  door, and it is the fastest target in the bar to recognise. */
  face?: NavFace;
}) {
  const here = activeTab(usePathname(), active);
  const router = useRouter();
  const [find, setFind] = useState(false);
  // The week behind the sheet is a server render, so closing is where it
  // catches up: follow three people and the rail has to know.
  const closeFind = () => {
    setFind(false);
    router.refresh();
  };

  return (
    <div className="navdock">
    <nav className="navbar" aria-label="Main">
      {navTabs(coach, scheduleHref, profileHref).map((t) => {
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
                <Icon name={t.icon} size={28} />
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
    <button className="navfind" aria-label="Find coaches" onClick={() => setFind(true)}>
      <Icon name="search" size={26} />
    </button>
    {find && <DiscoverSheet onClose={closeFind} />}
    </div>
  );
}
