"use client";

import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { useBandTop, useStuck } from "@/components/CalendarBits";

// Contact is not among them: it's the pill in the header and a sheet, and
// /{handle}/contact redirects onto the schedule where that pill lives.
export type ProfileTab = "about" | "studios" | "schedule" | "following";

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
  heroPhoto,
  heroColor,
  heroCta,
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
  /** The photo as a full-bleed hero instead of the circle: it runs up under
   *  the header, everything on it goes white, and a scrim at each end keeps
   *  the words legible. An experiment, by Matt's ask; null keeps the circle. */
  heroPhoto?: string | null;
  /** No photo yet: the hero runs anyway, filled with the person's own
   *  derived colour, so a page without a picture is the same page rather
   *  than a lesser layout. */
  heroColor?: string | null;
  /** A small control on the colour hero: the owner's way to add the photo
   *  the space is waiting for. */
  heroCta?: ReactNode;
  /** The row of pills under the name. A visitor gets Contact and Follow; the
   *  owner gets Share and Edit profile in the same two slots. */
  actions: ReactNode;
  /** Beside the name: only a studio uses it now, for the Verified badge that
   *  explains why the pencil is missing. */
  badges: ReactNode | null;
  /** Top right of the header: a studio's dots. A person's settings live in
   *  the shared app header, so their profile corner stays empty. */
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
  const headRef = useRef<HTMLDivElement>(null);

  // The tab row pins at the top once the card slides up, the calendar's own
  // pattern: it publishes its measured height as --dayband-top, and the day
  // bands in the schedule pin right under it. One writer, one reader chain,
  // same as everywhere bands pin under chrome.
  useBandTop(stickRef);
  // Pinned at the very top, the row squares its corners: kept round, the
  // rows scroll up visibly behind the corner notches.
  useStuck(stickRef);

  // The head is chrome, pinned like the header above it: face, name, meta and
  // the two pills all stay put, and the card slides up over the lot. Its
  // sticky top is the header's measured height, zero for a stranger whose
  // page has no app header; measured, because the safe area moves it.
  useEffect(() => {
    const el = headRef.current;
    if (!el) return;
    // The app header signed in, the public bar for a stranger: whichever is
    // above the head is what it pins under (and what the hero photo reaches
    // up beneath). Its bottom edge is the head's natural top, because both
    // bars pin at the very top themselves.
    const bar = document.querySelector<HTMLElement>(".brandbar, .pubtop");
    const set = () =>
      el.style.setProperty("--head-top", `${bar ? Math.round(bar.getBoundingClientRect().bottom) : 0}px`);
    set();
    if (!bar) return;
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    return () => ro.disconnect();
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
  // A tab with an info dot wraps the pair, so the pill's wash draws around
  // both and the dot reads as part of the tab rather than a fourth one. The
  // dot stays a sibling of the link inside it: a button in a link is not a
  // thing.
  const tabLink = (t: TabDef, i: number) => {
    const link = (
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
    );
    // The info dot only rides its tab while that tab is the one you are
    // on, by Matt's call: pinned to an unselected pill it read as a stray
    // control that fell out of the row.
    if (!t.info || tab !== t.key) return <Fragment key={t.key}>{link}</Fragment>;
    return (
      <span key={t.key} className={`pubtab-pair${tab === t.key ? " sel" : ""}`}>
        {link}
        {t.info}
      </span>
    );
  };

  return (
    <>
      {/* Who this is, top to bottom and centred: face, name, what and where,
          then the two things you can do about it. A profile is the one screen
          about a person rather than a list, so it gets the symmetry. */}
      <div className={`pubhead${heroPhoto || heroColor ? " pubhead-hero" : ""}`} ref={headRef}>
        {heroPhoto ? (
          <>
            {/* The photo, from the very top of the screen: it reaches up by
                the pinned header's measured height (--head-top is already on
                this element), so the header floats on it in white. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="pubhero-bg" src={heroPhoto} alt="" />
            <span className="pubhero-dim" aria-hidden="true" />
          </>
        ) : heroColor ? (
          <>
            {/* The same full-bleed block in the person's own colour, with
                the same bottom scrim so the name reads the same way. */}
            <span className="pubhero-bg pubhero-color" style={{ background: heroColor }} aria-hidden="true" />
            <span className="pubhero-dim" aria-hidden="true" />
          </>
        ) : null}
        {!heroPhoto && !heroColor && avatar}
        {heroCta}
        {/* The corner slots come after the picture on purpose: neither owns a
            z-index (see the stacking note in the CSS), so DOM order is what
            paints them on top, and a studio's banner is positioned now. */}
        {backTo ? (
          <div className="profback">
            <BackLink
              className="evback"
              href={backTo.href}
              label={backTo.label}
              anywhere
              notUnder={base}
            >
              <Icon name="arrow_back" size={23} />
            </BackLink>
          </div>
        ) : null}
        {ownerTop && <div className="ownertop">{ownerTop}</div>}
        {/* The badge sits above the name, by Matt's call: the claim leads
            the identity it speaks for. */}
        {badges && <div className="profbadges-top">{badges}</div>}
        <div className="profname-row">
          <h1 className="profname">{name}</h1>
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
      {/* The card. The head above sits on the shell gray; the tabs row is
          the first thing on the paper, and the panel rides it to the bottom
          of the page. */}
      <div className="pubcard">
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
      </div>
    </>
  );
}
