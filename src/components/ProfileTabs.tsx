"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";

type Tab = "about" | "contact" | "schedule";

// The public profile header + About/Contact/Schedule sections. All render in
// one continuous scroll: the name row sticks to the top, the tabs stick just
// beneath it, and the title scrolls away between. The tabs are scroll anchors —
// tapping one glides to that section — and a scroll-spy keeps the active tab in
// sync with whatever section is under the sticky header.
export function ProfileTabs({
  handle,
  initialTab,
  name,
  title,
  location,
  trackSchedule,
  share,
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
  share: ReactNode;
  about: ReactNode;
  contact: ReactNode | null;
  schedule: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const rowRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const contactRef = useRef<HTMLDivElement>(null);
  const schedRef = useRef<HTMLDivElement>(null);
  const [rowH, setRowH] = useState(0);
  const [tabsH, setTabsH] = useState(0);
  const didInitScroll = useRef(false);
  const trackedSchedule = useRef(false);

  // The tabs stick right below the name row, so their offset tracks its height;
  // the two heights together define where a scrolled-to section should land.
  useEffect(() => {
    const measure = () => {
      if (rowRef.current) setRowH(rowRef.current.offsetHeight);
      if (tabsRef.current) setTabsH(tabsRef.current.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (rowRef.current) ro.observe(rowRef.current);
    if (tabsRef.current) ro.observe(tabsRef.current);
    return () => ro.disconnect();
  }, []);

  const offset = rowH + tabsH;

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
      <div className="pubhead" ref={rowRef}>
        <h1 className="profname">{name}</h1>
        {share}
      </div>
      {title.trim() && <p className="proftitle">{title}</p>}
      {location.trim() && (
        <p className="profloc">
          <Icon name="place" size={15} className="profloc-ic" />
          {location}
        </p>
      )}
      <div className="pubtabs" role="tablist" aria-label="Profile sections" ref={tabsRef} style={{ top: rowH }}>
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
