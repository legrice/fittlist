"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";

export function GlobalAdd() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="navtab navtab-add" data-tab="add" aria-label="Add" onClick={() => setOpen(true)}>
        <span className="navadd-glyph"><Icon name="add" size={29} /></span>
        <span>Add</span>
      </button>
      {open && <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
        <div className="sheet globaladd-sheet" role="dialog" aria-modal="true" aria-labelledby="globaladd-title">
          <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setOpen(false)}><Icon name="close" size={18} /></button>
          <h2 id="globaladd-title">Add to FittList</h2>
          <p className="lead">What are you adding?</p>
          <div className="globaladd-list">
            <Link href="/calendar?add=1" onClick={() => setOpen(false)}><Icon name="activity" size={23} /><span><b>A class</b><small>Something you coach or plan to attend.</small></span><Icon name="chevron_right" size={20} /></Link>
            <Link href="/calendar?add=place" onClick={() => setOpen(false)}><Icon name="place" size={23} /><span><b>A place with a class</b><small>Add the gym, studio, park, or space while listing what happens there.</small></span><Icon name="chevron_right" size={20} /></Link>
            <Link href="/calendar?add=event" onClick={() => setOpen(false)}><Icon name="event" size={23} /><span><b>A personal event</b><small>Add a run, meetup, or plan to your own schedule.</small></span><Icon name="chevron_right" size={20} /></Link>
          </div>
        </div>
      </div>}
    </>
  );
}
