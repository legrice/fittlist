"use client";

import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { Fragment, useEffect, useRef, type ReactNode } from "react";

// Contact is not among them: it's the pill in the header and a sheet, and
// /{handle}/contact redirects onto the schedule where that pill lives.
export type ProfileTab = "about" | "studios" | "schedule";

/** One tab: the key is the URL suffix, and the first in the list owns the
 *  bare base rather than a suffix of its own. */
export type TabDef = {
  key: string;
  label: string;
  /** A control rendered beside the tab, outside its link: a button inside a
   *  link is not a thing, so the info dot rides as a sibling. */
  info?: ReactNode;
};

// The profile header and one section under it. A coach, a member and a studio
// all wear this: the same circle of a face, the same name, the same two pills,
// the same tab row. What changes is what goes in the slots, which is the
// point: three near-identical headers is how they drift.
//
// The face is a circle again, not a full-bleed photograph. The hero shipped
// and it was handsome, and it was also the wrong app: a screen of photograph
// before any schedule said editorial when the product says calendar. The big
// picture still exists, one tap away, behind the avatar.
//
// The tabs are links, not scroll anchors. Every section has its own URL, so a
// coach can send someone straight to fittlist.co/{handle}/schedule and they
// land on the schedule rather than at the top of a long page with an implied
// instruction to scroll.
export function ProfileTabs({
  base,
  tab,
  tabs,
  name,
  title,
  location,
  trackSchedule = false,
  trackHandle,
  avatar,
  actions,
  badges,
  ownerTop,
  backTo,
  stickAction,
  children,
}: {
  /** The page's own URL: "/matt" for a person, "/s/ironbound" for a studio.
   *  Every tab but the first hangs its key off this. */
  base: string;
  /** Which tab's key is showing. */
  tab: string;
  /** In order. Empty means no tab row at all, which is right for a page with
   *  only one section: two tabs over two short lists is worse than neither. */
  tabs: TabDef[];
  name: string;
  title: string;
  location: string;
  /** Count one "schedule open" per visit, for a coach's own stats. */
  trackSchedule?: boolean;
  trackHandle?: string;
  /** The face: a person's AvatarZoom (tap it, see it big, with the share
   *  actions under it), a studio's plain circle. */
  avatar: ReactNode;
  /** The row of pills under the name. A visitor gets Contact and Follow; the
   *  owner gets Share and Edit profile in the same two slots. */
  actions: ReactNode;
  /** Beside the name: only a studio uses it now, for the Verified badge that
   *  explains why the pencil is missing. */
  badges: ReactNode | null;
  /** Top right of the header: a studio's dots. A coach's settings moved to
   *  the app header's gear, so a person's corner is empty. */
  ownerTop?: ReactNode;
  /** Where a back control should go, when they got here from a list. */
  backTo?: { href: string; label: string } | null;
  /** A compact copy of the Follow control, across from the small name in the
   *  stuck bar, so scrolling never carries someone away from the yes. */
  stickAction?: ReactNode;
  children: ReactNode;
}) {
  const tracked = useRef(false);
  const stickRef = useRef<HTMLDivElement>(null);
  const sentRef = useRef<HTMLDivElement>(null);

  // The tab row pins under the app header as the page scrolls, and once the
  // big header is gone it grows a small copy of the name, so a long schedule
  // never loses whose it is. The offset is measured because the header only
  // exists for a signed-in viewer; a stranger's bar owns the top itself.
  useEffect(() => {
    const stick = stickRef.current;
    const sent = sentRef.current;
    if (!stick || !sent) return;
    const bar = document.querySelector(".brandbar");
    const off = bar ? Math.round(bar.getBoundingClientRect().height) : 0;
    if (off) stick.style.top = off + "px";
    const ob = new IntersectionObserver(
      ([e]) => stick.classList.toggle("stuck", !e.isIntersecting),
      { rootMargin: `-${off + 1}px 0px 0px 0px` },
    );
    ob.observe(sent);
    return () => ob.disconnect();
  }, []);

  // Count one "schedule open" per visit. It used to fire when the scroll-spy
  // reached the schedule section; landing on the URL is the event now.
  useEffect(() => {
    if (tab !== "schedule" || !trackSchedule || !trackHandle || tracked.current) return;
    tracked.current = true;
    const url = `/api/track/schedule/${trackHandle}`;
    if (typeof navigator !== "undefined" && navigator.sendBeacon) navigator.sendBeacon(url);
    else fetch(url, { method: "POST", keepalive: true }).catch(() => {});
  }, [tab, trackSchedule, trackHandle]);

  // The first tab is the bare URL: it's what the link is for, and an About page
  // somebody hasn't filled in is an awkward first thing to land on. The old
  // suffix still resolves, because people have already sent that link.
  const tabLink = (t: TabDef, i: number) => (
    <Fragment key={t.key}>
      <Link
        href={i === 0 ? base : `${base}/${t.key}`}
        aria-current={tab === t.key ? "page" : undefined}
        className={`pubtab${tab === t.key ? " sel" : ""}`}
        // Switching sections shouldn't throw you back to the top of a page you
        // are already partway down; the header above is identical either way.
        scroll={false}
      >
        {t.label}
      </Link>
      {t.info}
    </Fragment>
  );

  return (
    <>
      {/* Who this is, top to bottom and centred: face, name, what and where,
          then the two things you can do about it. A profile is the one screen
          about a person rather than a list, so it gets the symmetry. */}
      <div className="pubhead">
        {avatar}
        {/* The corner slots come after the picture on purpose: neither owns a
            z-index (see the stacking note in the CSS), so DOM order is what
            paints them on top, and a studio's banner is positioned now. */}
        {backTo && (
          <div className="profback">
            <BackLink
              className="evback"
              href={backTo.href}
              label={backTo.label}
              anywhere
              notUnder={base}
            >
              <Icon name="arrow_back" size={21} />
            </BackLink>
          </div>
        )}
        {ownerTop && <div className="ownertop">{ownerTop}</div>}
        {/* The badge rides with the name and wraps under it when the name is
            long, rather than being pushed down the page by the lines between. */}
        <div className="profname-row">
          <h1 className="profname">{name}</h1>
          {badges}
        </div>
        {/* What they do and where, on one line and quieter than the name. */}
        {(title.trim() || location.trim()) && (
          <p className="profmeta">
            {title.trim() && <span className="proftitle">{title.trim()}</span>}
            {title.trim() && location.trim() && (
              <span className="profmeta-sep" aria-hidden="true">
                &middot;
              </span>
            )}
            {location.trim() && <span className="profwhere">{location.trim()}</span>}
          </p>
        )}
        {actions}
      </div>
      {/* Zero-height marker: when it slides under the header, the bar below
          is stuck and the small name switches on. */}
      <div ref={sentRef} aria-hidden="true" />
      <div ref={stickRef} className={`pubstick${tabs.length ? "" : " pubstick-bare"}`}>
        <div className="pubstick-row">
          {/* A duplicate for the eyes only; the real name is the h1 above. */}
          <div className="pubstick-name" aria-hidden="true">
            {name}
          </div>
          {stickAction}
        </div>
        {tabs.length > 0 && (
          <div className="pubtabs" aria-label="Profile sections">
            {tabs.map(tabLink)}
          </div>
        )}
      </div>
      <div className="pubpanel">{children}</div>
    </>
  );
}
