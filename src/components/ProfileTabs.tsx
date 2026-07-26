"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// The public profile header + About/Schedule switcher. On scroll the name row
// and the share button stick to the top, the tabs stick just beneath them, and
// the title/tagline scrolls away in between. Both panels render on the server
// and mount at once, so switching is instant and updates the URL.
export function ProfileTabs({
  handle,
  initialTab,
  name,
  title,
  share,
  about,
  schedule,
}: {
  handle: string;
  initialTab: "about" | "schedule";
  name: string;
  title: string;
  share: ReactNode;
  about: ReactNode;
  schedule: ReactNode;
}) {
  const [tab, setTab] = useState<"about" | "schedule">(initialTab);
  const rowRef = useRef<HTMLDivElement>(null);
  const [rowH, setRowH] = useState(0);

  // The tabs stick right below the name row, so their offset tracks its height.
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const measure = () => setRowH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const select = (t: "about" | "schedule") => {
    setTab(t);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", t === "schedule" ? `/${handle}/schedule` : `/${handle}`);
    }
  };

  return (
    <>
      <div className="pubhead" ref={rowRef}>
        <h1 className="profname">{name}</h1>
        {share}
      </div>
      {title.trim() && <p className="proftitle">{title}</p>}
      <div className="pubtabs" role="tablist" aria-label="Profile sections" style={{ top: rowH }}>
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
      <div className="pubpanel" role="tabpanel" hidden={tab !== "about"}>
        {about}
      </div>
      <div className="pubpanel" role="tabpanel" hidden={tab !== "schedule"}>
        {schedule}
      </div>
    </>
  );
}
