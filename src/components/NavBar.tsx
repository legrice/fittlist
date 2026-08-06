"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
import { LinkPending } from "@/components/LinkPending";
import { ShareHub } from "@/components/ShareHub";
import { activeTab, navTabs, type NavTab } from "@/lib/nav";

export type { NavTab };

/** The viewer's own face. It rides the header's top right now rather than a
 *  tab, but the shape is still what a shell hands around. */
export type NavFace = { photo: string | null; color: string; initial: string };

// The whole app in thumb reach: the three screens you move between, and one
// act. Share rides the bar as a tab now, by Matt's call: it opens the hub of
// every way to hand your page on rather than navigating, because sharing is
// what the app is for and it should not take a trip to your profile to
// start. Search went back where it came from, the header's magnifier and
// Following's floating circle. Above 940px this hides and HeaderNav takes
// over, off the same list.
export function NavBar({
  active,
  coach = true,
  scheduleHref,
  profileHref,
  handle,
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
  /** Your handle, for the share hub's link, QR and card. Without one (an
   *  account still mid-signup) the Share tab links to the editor instead. */
  handle?: string | null;
  /** The viewer's own face, for the Profile tab. A glyph there is the only
   *  tab in the bar naming a thing rather than a place, and a person is not a
   *  thing: your own picture is what every app you already use puts on that
   *  door, and it is the fastest target in the bar to recognise. */
  face?: NavFace;
}) {
  const here = activeTab(usePathname(), active);
  // Share opens the hub over wherever you are standing rather than
  // navigating: it is an act with several endings (the link, the QR, the
  // picture), and the hub is where they all live.
  const [share, setShare] = useState(false);

  return (
    <nav className="navbar" aria-label="Main">
      {navTabs(coach, scheduleHref, profileHref).map((t) => {
        if (t.id === "share" && handle) {
          return (
            <button
              key={t.id}
              className={`navtab${share ? " on" : ""}`}
              data-tab={t.id}
              aria-expanded={share}
              onClick={() => setShare(true)}
            >
              <span className="navglyph">
                <Icon name={t.icon} size={26} />
              </span>
              <span>{t.label}</span>
            </button>
          );
        }
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
                // 26, the face's own size: a glyph even two pixels bigger
                // than the photo beside it makes the face the odd tab out.
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
      {share && handle && (
        <BodyPortal>
          <ShareHub coach={coach} handle={handle} onClose={() => setShare(false)} />
        </BodyPortal>
      )}
    </nav>
  );
}
