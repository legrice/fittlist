"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

export type ProfileTab = "about" | "studios" | "contact" | "schedule";

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
  hasContact,
  hasStudios,
  trackSchedule,
  avatar,
  actions,
  avail,
  ownerTop,
  stickAction,
  children,
}: {
  handle: string;
  tab: ProfileTab;
  name: string;
  title: string;
  location: string;
  /** No contact details and no way to write to them means no Contact tab. */
  hasContact: boolean;
  /** Nowhere they coach on record means no Studios tab. */
  hasStudios: boolean;
  trackSchedule: boolean;
  /** The face: photo or coloured initial, above the name. */
  avatar: ReactNode;
  /** The row of pills under the name: Message, Follow. */
  actions: ReactNode;
  avail: ReactNode | null;
  /** The owner's controls, top right of the header: the three-dot in the
   *  corner, and the labeled Add class pill across from the photo. Frequency
   *  decides placement: adding is occasional maintenance and lives up top;
   *  sharing is the weekly habit and owns the floating button below. */
  ownerTop?: ReactNode;
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
      <div className="pubhead">
        {ownerTop && <div className="ownertop">{ownerTop}</div>}
        {avatar}
        {/* The badge rides with the name and wraps under it when the name is
            long, rather than being pushed down the page by the lines between. */}
        <div className="profname-row">
          <h1 className="profname">{name}</h1>
          {avail}
        </div>
        {/* Location and title on their own lines. Joined into "Strength coach in
            Jersey City, NJ" they made one long line that wrapped to two anyway,
            and the city is the thing people scan for. */}
        {location.trim() && <p className="profwhere">{location.trim()}</p>}
        {title.trim() && <p className="proftitle">{title.trim()}</p>}
        {actions}
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
          {hasContact && tabLink("contact", "Contact")}
        </div>
      </div>
      <div className="pubpanel">{children}</div>
    </>
  );
}
