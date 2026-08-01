"use client";

import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { useEffect, useRef, type ReactNode } from "react";

// Contact is not among them: it's the pill in the header and a sheet, and
// /{handle}/contact redirects onto the schedule where that pill lives.
export type ProfileTab = "about" | "studios" | "schedule";

// The public profile header and one section under it.
//
// The tabs are links, not scroll anchors. Every section has its own URL, so a
// coach can send someone straight to fittlist.co/{handle}/schedule and they
// land on the schedule rather than at the top of a long page with an implied
// instruction to scroll. It also means the section survives a reload, a share
// and the back button, none of which a replaceState-on-scroll managed.
export function ProfileTabs({
  handle,
  tab,
  name,
  title,
  location,
  hasStudios,
  trackSchedule,
  photo,
  color,
  actions,
  avail,
  ownerTop,
  backTo,
  stickAction,
  children,
}: {
  handle: string;
  tab: ProfileTab;
  name: string;
  title: string;
  location: string;
  /** Nowhere they coach on record means no Studios tab. */
  hasStudios: boolean;
  trackSchedule: boolean;
  /** The face, full bleed behind the name. Null falls back to the colour, and
   *  then there is nothing to scrim: flat colour is already legible. */
  photo: string | null;
  /** Their colour, behind the name when there's no photo. */
  color: string;
  /** The row of pills under the name. A visitor gets Contact and Follow; the
   *  owner gets Share and Edit profile in the same two slots. */
  actions: ReactNode;
  avail: ReactNode | null;
  /** Top right of the header, owner only: the settings gear. Everything else
   *  they do to this page is on the pills under the name or the floating Add
   *  class button, so nothing else belongs in the corner. */
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

  // The tab row pins to the top as the page scrolls, and once the big header
  // is gone it grows a small copy of the name, so a long schedule never loses
  // whose it is. The offset is the app header's height when there is one (a
  // signed-in viewer keeps the app chrome, which is sticky itself); a
  // stranger's bar owns the top of the screen.
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
    if (tab !== "schedule" || !trackSchedule || tracked.current) return;
    tracked.current = true;
    const url = `/api/track/schedule/${handle}`;
    if (typeof navigator !== "undefined" && navigator.sendBeacon) navigator.sendBeacon(url);
    else fetch(url, { method: "POST", keepalive: true }).catch(() => {});
  }, [tab, trackSchedule, handle]);

  // Schedule is the bare handle: it's what the link is for, and an About page
  // a coach hasn't filled in is an awkward first thing to land on. /schedule
  // still resolves, because people have already sent that link.
  const tabLink = (t: ProfileTab, label: string) => (
    <Link
      key={t}
      href={t === "schedule" ? `/${handle}` : `/${handle}/${t}`}
      aria-current={tab === t ? "page" : undefined}
      className={`pubtab${tab === t ? " sel" : ""}`}
      // Switching sections shouldn't throw you back to the top of a page you
      // are already partway down; the header above is identical either way.
      scroll={false}
    >
      {label}
    </Link>
  );

  return (
    <>
      {/* Who this is, top to bottom: face, name, where, what. Then the things
          you can do about it, then the section you asked for. */}
      {/* The photo is the header rather than a circle inside one: it runs to
          both edges, under the app bar, with the name over it. A scrim only
          exists where there's a photo to read against; a flat colour already
          clears white text, and dimming it would just make it muddy. */}
      <div className={`profhero${photo ? " hasphoto" : ""}`}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="profhero-img" src={photo} alt="" />
        ) : (
          <div className="profhero-img" style={{ background: color }} aria-hidden="true" />
        )}
        {photo && <div className="profhero-scrim" aria-hidden="true" />}
        {backTo && (
          <div className="profback">
            <BackLink className="evback" href={backTo.href} label={backTo.label}>
              <Icon name="arrow_back" size={21} />
            </BackLink>
          </div>
        )}
        {ownerTop && <div className="ownertop">{ownerTop}</div>}
        {/* Left aligned along the bottom: what they are, who they are, what
            they do. The badge leads because it's the one word that says which
            side of the app you're looking at. */}
        <div className="profhero-txt">
          {avail}
          <h1 className="profname">{name}</h1>
          {title.trim() && <p className="proftitle">{title.trim()}</p>}
          {location.trim() && <p className="profwhere">{location.trim()}</p>}
          {/* On the image, under the name: the two things you can do about
              this person sit with the person rather than on the paper below. */}
          {actions}
        </div>
      </div>
      {/* Zero-height marker: when it slides under the header, the bar below
          is stuck and the small name switches on. */}
      <div ref={sentRef} aria-hidden="true" />
      <div ref={stickRef} className="pubstick">
        <div className="pubstick-row">
          {/* A duplicate for the eyes only; the real name is the h1 above. */}
          <div className="pubstick-name" aria-hidden="true">
            {name}
          </div>
          {stickAction}
        </div>
        <div className="pubtabs" aria-label="Profile sections">
          {tabLink("schedule", "Schedule")}
          {tabLink("about", "About")}
          {hasStudios && tabLink("studios", "Studios")}
        </div>
      </div>
      <div className="pubpanel">{children}</div>
    </>
  );
}
