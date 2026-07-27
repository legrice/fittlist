"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";

// The public profile header + About/Schedule sections. Both render in one
// continuous scroll: the name row sticks to the top, the tabs stick just
// beneath it, and the title scrolls away between. The tabs are scroll anchors —
// tapping one glides to that section — and a scroll-spy keeps the active tab in
// sync with whatever section is under the sticky header.
export function ProfileTabs({
  handle,
  initialTab,
  name,
  title,
  location,
  share,
  about,
  schedule,
}: {
  handle: string;
  initialTab: "about" | "schedule";
  name: string;
  title: string;
  location: string;
  share: ReactNode;
  about: ReactNode;
  schedule: ReactNode;
}) {
  const [tab, setTab] = useState<"about" | "schedule">(initialTab);
  const rowRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const schedRef = useRef<HTMLDivElement>(null);
  const [rowH, setRowH] = useState(0);
  const [tabsH, setTabsH] = useState(0);
  const didInitScroll = useRef(false);

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

  const goTo = (t: "about" | "schedule", smooth = true) => {
    const behavior: ScrollBehavior = smooth ? "smooth" : "auto";
    if (t === "schedule") schedRef.current?.scrollIntoView({ behavior, block: "start" });
    else window.scrollTo({ top: 0, behavior });
  };

  const select = (t: "about" | "schedule") => {
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
        const top = sched.getBoundingClientRect().top;
        setTab(top <= offset + 16 ? "schedule" : "about");
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [offset]);

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
        <button
          role="tab"
          aria-selected={tab === "about"}
          className={`pubtab${tab === "about" ? " sel" : ""}`}
          onClick={() => select("about")}
        >
          About
        </button>
        <button
          role="tab"
          aria-selected={tab === "schedule"}
          className={`pubtab${tab === "schedule" ? " sel" : ""}`}
          onClick={() => select("schedule")}
        >
          Schedule
        </button>
      </div>
      <div className="pubpanel" style={{ scrollMarginTop: offset }}>
        {about}
      </div>
      <div className="pubpanel" ref={schedRef} style={{ scrollMarginTop: offset }}>
        {schedule}
      </div>
    </>
  );
}
