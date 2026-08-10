"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";

const links = [["About", "/about"], ["Contact", "/contact"], ["Privacy", "/privacy"], ["Support", "/support"]] as const;

export function HeaderMenu() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  return <>
    <button className="headermenu-btn" aria-label="Menu" onClick={() => setOpen(true)}><Icon name="menu" size={22} /></button>
    {open && createPortal(
      <div className="sheet-scrim" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
        <nav className="sheet headermenu-sheet" aria-label="FittList information">
          <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setOpen(false)}><Icon name="close" size={18} /></button>
          <h2>FittList</h2>
          <div className="settingslist">
            {links.map(([label, href]) => <Link key={href} className="setrow" href={href} onClick={() => setOpen(false)}>
              <span className="setrow-txt"><span className="t">{label}</span></span><Icon name="chevron_right" size={20} />
            </Link>)}
          </div>
        </nav>
      </div>, document.body)}
  </>;
}
