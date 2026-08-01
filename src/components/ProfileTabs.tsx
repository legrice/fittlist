"use client";

import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { ProfileShare } from "@/components/ProfileShare";
import { useEffect, useRef, type ReactNode } from "react";

// Contact is not among them: it's the pill in the header and a sheet, and
// /{handle}/contact redirects onto the schedule where that pill lives.
export type ProfileTab = "about" | "studios" | "schedule";

/** One tab: the key is the URL suffix, and the first in the list owns the
 *  bare base rather than a suffix of its own. */
export type TabDef = { key: string; label: string };

// The profile header and one section under it. A coach, a member and a studio
// all wear this: the same photograph, the same badge above the name, the same
// two pills on the picture, the same tab row. What changes is what goes in the
// slots, which is the point. Three near-identical headers is how they drift,
// and a member's page looking like a lesser version of a coach's was exactly
// what that drift produced.
//
// The tabs are links, not scroll anchors. Every section has its own URL, so a
// coach can send someone straight to fittlist.co/{handle}/schedule and they
// land on the schedule rather than at the top of a long page with an implied
// instruction to scroll. It also means the section survives a reload, a share
// and the back button, none of which a replaceState-on-scroll managed.
export function ProfileTabs({
  base,
  tab,
  tabs,
  name,
  title,
  location,
  trackSchedule = false,
  trackHandle,
  photo,
  color,
  actions,
  avail,
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
  /** The face, full bleed behind the name. Null falls back to the colour, and
   *  then there is nothing to scrim: flat colour is already legible. */
  photo: string | null;
  /** Their colour, behind the name when there's no photo. */
  color: string;
  /** The row of pills under the name. A visitor gets Contact and Follow; the
   *  owner gets Share and Edit profile in the same two slots. */
  actions: ReactNode;
  /** The badges above the name: what this is, and anything about it that
   *  changes (a coach taking clients, a studio keeping its own page). */
  avail: ReactNode | null;
  /** Top right of the header: a coach's settings gear, a studio's dots.
   *  Everything else lives on the pills under the name. */
  ownerTop?: ReactNode;
  /** Where a back control should go, when they got here from a list. Null on
   *  a cold open: the tab bar is the way out and an arrow to nowhere is worse
   *  than none. */
  backTo?: { href: string; label: string } | null;
  /** A compact copy of the Follow control, across from the small name in the
   *  stuck bar, so scrolling never carries someone away from the yes. */
  stickAction?: ReactNode;
  children: ReactNode;
}) {
  const tracked = useRef(false);
  const stickRef = useRef<HTMLDivElement>(null);
  const sentRef = useRef<HTMLDivElement>(null);

  // The tab row pins to the very top as the page scrolls, and once the big
  // header is gone it grows a small copy of the name, so a long schedule never
  // loses whose it is. Nothing above it sticks: the app header and a stranger's
  // bar both scroll away with the picture, which is why there is no offset to
  // measure here any more. It used to read the brandbar's height and hold that
  // much space, and a bar that no longer pins would have left a gap.
  useEffect(() => {
    const stick = stickRef.current;
    const sent = sentRef.current;
    if (!stick || !sent) return;
    const ob = new IntersectionObserver(
      ([e]) => stick.classList.toggle("stuck", !e.isIntersecting),
      { rootMargin: "-1px 0px 0px 0px" },
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
    <Link
      key={t.key}
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

  return (
    <>
      {/* Who this is, top to bottom: face, name, where, what. Then the things
          you can do about it, then the section you asked for. */}
      {/* The photo is the header rather than a circle inside one: it runs to
          both edges, under the app bar, with the name over it. A scrim only
          exists where there's a photo to read against, and only over the
          bottom of it, where the words are. */}
      <div className={`profhero${photo ? " hasphoto" : ""}`}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="profhero-img" src={photo} alt="" />
        ) : (
          <div className="profhero-img" style={{ background: color }} aria-hidden="true" />
        )}
        {photo && <div className="profhero-scrim" aria-hidden="true" />}
        {/* A second, shorter one at the top, so the white header floating over
            the picture has something to read against. Same rule as the one
            below: only where there's a photograph, because a flat colour is
            already legible and a band of grey over it is just a band. */}
        {photo && <div className="profhero-topscrim" aria-hidden="true" />}
        {/* Always there, because it is the only way off this page: a profile
            carries no tab bar any more. It pops to whatever is underneath, and
            falls back to the named destination only on a cold open, where
            "wherever you came from" is somebody else's website. */}
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
        {/* Across from the back control, in the same shape: everybody can hand
            this page on, and until now only its owner could. Whatever else the
            corner holds (a coach's gear, a studio's dots) sits inside it. */}
        <div className="ownertop">
          {ownerTop}
          <ProfileShare path={base} name={name} />
        </div>
        {/* Left aligned along the bottom: what they are, who they are, what
            they do. The badge leads because it's the one word that says which
            side of the app you're looking at. */}
        <div className="profhero-txt">
          {avail}
          <h1 className="profname">{name}</h1>
          {title.trim() && <p className="proftitle">{title.trim()}</p>}
          {location.trim() && (
            <p className="profwhere">
              <Icon name="place" size={14} /> {location.trim()}
            </p>
          )}
          {/* On the image, under the name: the two things you can do about
              this person sit with the person rather than on the paper below. */}
          {actions}
        </div>
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
