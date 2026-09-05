"use client";

import { useEffect, useRef, useState } from "react";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
import { SearchScreen } from "@/components/SearchScreen";

export function SiteSearchSheet({ todayIso, userId, onClose }: { todayIso: string; userId: string; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const sheet = useRef<HTMLElement>(null);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && sheet.current && document.activeElement?.closest('.sheet, [role="dialog"]') === sheet.current) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);

  return <BodyPortal>
    <div className="sheet-scrim site-search-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={sheet} className="sheet utility-sheet site-search-sheet" role="dialog" aria-modal="true" aria-labelledby="site-search-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="utility-sheet-head">
          <span className="utility-sheet-grab" aria-hidden="true" />
          <h2 id="site-search-title">Search</h2>
          <button type="button" className="sheetclose sheet-dismiss" aria-label="Close search" onClick={onClose}><Icon name="close" size={20} /></button>
          <label>
            <Icon name="search" size={21} />
            <input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search FittList" aria-label="Search FittList" />
            {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><Icon name="close" size={18} /></button>}
          </label>
        </header>
        <div className="utility-sheet-content site-search-results"><SearchScreen todayIso={todayIso} userId={userId} query={query} showRecents={false} /></div>
      </section>
    </div>
  </BodyPortal>;
}
