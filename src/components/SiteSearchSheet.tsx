"use client";

import { useState } from "react";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
import { SearchScreen } from "@/components/SearchScreen";

export function SiteSearchSheet({ todayIso, userId, onClose }: { todayIso: string; userId: string; onClose: () => void }) {
  const [query, setQuery] = useState("");

  return <BodyPortal>
    <div className="site-search-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="site-search-sheet" role="dialog" aria-modal="true" aria-label="Search FittList" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <label>
            <Icon name="search" size={21} />
            <input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search FittList" aria-label="Search FittList" />
            {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><Icon name="close" size={18} /></button>}
          </label>
          <button type="button" className="site-search-close" aria-label="Close search" onClick={onClose}><Icon name="close" size={21} /></button>
        </header>
        <div className="site-search-results"><SearchScreen todayIso={todayIso} userId={userId} query={query} showRecents={false} /></div>
      </section>
    </div>
  </BodyPortal>;
}
