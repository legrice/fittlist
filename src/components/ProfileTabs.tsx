"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Tab = "about" | "contact" | "schedule";

// The public profile header + About/Contact/Schedule sections, in one
// continuous scroll. The identity block (face, name, where, what, then the
// actions) scrolls away; the tab pills stick to the top, because once you're
// reading a section the tabs are the only control you still want. They double
// as scroll anchors, and a scroll-spy keeps the active pill in sync with
// whatever section is under them.
export function ProfileTabs({
  handle,
  initialTab,
  name,
  title,
  location,
  trackSchedule,
  back,
  avatar,
  actions,
  avail,
  about,
  contact,
  schedule,
}: {
  handle: string;
  initialTab: "about" | "schedule";
  name: string;
  title: string;
  location: string;
  trackSchedule: boolean;
  /** The way out, on its own line above the identity block. */
  back: ReactNode;
  /** The face: photo or coloured initial, above the name. */
  avatar: ReactNode;
  /** The row of pills under the name: Message, Follow. */
  actions: ReactNode;
  avail: ReactNode | null;
  about: ReactNode;
  contact: ReactNode | null;
  schedule: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const tabsRef = useRef<HTMLDivElement>(null);
  const contactRef = useRef<HTMLDivElement>(null);
  const schedRef = useRef<HTMLDivElement>(null);
  const [tabsH, setTabsH] = useState(0);
  const didInitScroll = useRef(false);
  const trackedSchedule = useRef(false);

  // Only the tabs pin now, so they're the whole sticky offset: how far down a
  // scrolled-to section has to land to clear them.
  useEffect(() => {
    const measure = () => {
      if (tabsRef.current) setTabsH(tabsRef.current.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (tabsRef.current) ro.observe(tabsRef.current);
    return () => ro.disconnect();
  }, []);

  const offset = tabsH;

  const goTo = (t: Tab, smooth = true) => {
    const behavior: ScrollBehavior = smooth ? "smooth" : "auto";
    if (t === "schedule") schedRef.current?.scrollIntoView({ behavior, block: "start" });
    else if (t === "contact") contactRef.current?.scrollIntoView({ behavior, block: "start" });
    else window.scrollTo({ top: 0, behavior });
  };

  const select = (t: Tab) => {
    setTab(t);
    goTo(t);
    window.history.replaceState(null, "", t === "schedule" ? `/${handle}/schedule` : `/${handle}`);
  };

  // Arriving at /{handle}/schedule lands you on the schedule once heights are
  // measured (so the sticky offset is correct).
  useEffect(() => {
    if (initialTab === "schedule" && offset > 0 && !didInitScroll.current) {
      didInitScroll.current = true;
      goTo("schedule", false);
    }
    // Run once heights are known; goTo/initialTab are stable enough here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset]);

  // Scroll-spy: whichever section sits under the sticky header is "active".
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const sched = schedRef.current;
        if (!sched) return;
        const line = offset + 16;
        if (sched.getBoundingClientRect().top <= line) {
          setTab("schedule");
          return;
        }
        const contactEl = contactRef.current;
        if (contactEl && contactEl.getBoundingClientRect().top <= line) {
          setTab("contact");
          return;
        }
        setTab("about");
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [offset]);

  // Count one "schedule open" per visit, the first time the schedule is viewed.
  useEffect(() => {
    if (tab !== "schedule" || !trackSchedule || trackedSchedule.current) return;
    trackedSchedule.current = true;
    const url = `/api/track/schedule/${handle}`;
    if (typeof navigator !== "undefined" && navigator.sendBeacon) navigator.sendBeacon(url);
    else fetch(url, { method: "POST", keepalive: true }).catch(() => {});
  }, [tab, trackSchedule, handle]);

  const tabBtn = (t: Tab, label: string) => (
    <button
      role="tab"
      aria-selected={tab === t}
      className={`pubtab${tab === t ? " sel" : ""}`}
      onClick={() => select(t)}
    >
      {label}
    </button>
  );

  return (
    <>
      {/* Who this is, top to bottom: face, name, where, what. Then the things
          you can do about it. The block scrolls away; only the tabs pin, which
          is what you need once you're reading a section. */}
      <div className="pubhead">
        {back}
        {avatar}
        <h1 className="profname">{name}</h1>
        {/* Location and title on their own lines. Joined into "Strength coach in
            Jersey City, NJ" they made one long line that wrapped to two anyway,
            and the city is the thing people scan for. */}
        {location.trim() && <p className="profwhere">{location.trim()}</p>}
        {title.trim() && <p className="proftitle">{title.trim()}</p>}
        {avail}
        {actions}
      </div>
      <div className="pubtabs" role="tablist" aria-label="Profile sections" ref={tabsRef} style={{ top: 0 }}>
        {tabBtn("about", "About")}
        {contact && tabBtn("contact", "Contact")}
        {tabBtn("schedule", "Schedule")}
      </div>
      <div className="pubpanel" style={{ scrollMarginTop: offset }}>
        {about}
      </div>
      {contact && (
        <div className="pubpanel pubpanel-sched" ref={contactRef} style={{ scrollMarginTop: offset }}>
          {contact}
        </div>
      )}
      <div className="pubpanel pubpanel-sched" ref={schedRef} style={{ scrollMarginTop: offset }}>
        {schedule}
      </div>
    </>
  );
}
