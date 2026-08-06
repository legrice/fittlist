"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BodyPortal } from "@/components/BodyPortal";
import { DiscoverSheet } from "@/components/DiscoverSheet";
import { Icon } from "@/components/Icon";
import { LinkPending } from "@/components/LinkPending";
import { activeTab, navTabs, type NavTab } from "@/lib/nav";

export type { NavTab };

/** The viewer's own face. It rides the header's top right now rather than a
 *  tab, but the shape is still what a shell hands around. */
export type NavFace = { photo: string | null; color: string; initial: string };

// The whole app in thumb reach: the screens you move between in the pill,
// and the one act you reach for from anywhere in its own circle beside it,
// the way Slack draws its bottom bar. The dock shape was tried once with
// three tabs and read as crammed; with four tabs at the smaller glyph size
// it is the reference Matt sent, so search lives here for good and
// Following's floating circle is gone. The circle opens the directory sheet
// over wherever you are standing. Above 940px this hides and HeaderNav
// takes over, off the same list.
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
  // The circle pulls the directory sheet up over wherever you are standing;
  // the week behind it is a server render, so closing is where it catches up.
  const [find, setFind] = useState(false);
  const closeFind = () => {
    setFind(false);
    router.refresh();
  };

  return (
    <div className="navwrap">
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
                  // 23, the face's own size, a step down from 26: four tabs
                  // and the circle share the width now, and the glyphs give
                  // back the room.
                  <Icon name={t.icon} size={23} />
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
      {/* Search, in its own perfect circle beside the pill: the act you
          reach for from anywhere, drawn the way Slack draws it. */}
      <button
        className="navfind"
        aria-label="Find coaches"
        aria-expanded={find}
        onClick={() => setFind(true)}
      >
        <Icon name="search" size={24} />
      </button>
      {find && (
        <BodyPortal>
          <DiscoverSheet onClose={closeFind} />
        </BodyPortal>
      )}
    </div>
  );
}
