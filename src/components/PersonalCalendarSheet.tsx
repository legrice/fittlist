"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { BodyPortal } from "@/components/BodyPortal";
import { CalendarScreen } from "@/components/CalendarScreen";
import { loadPersonalCalendarData, type PersonalCalendarData } from "@/app/actions/calendar-data";

export function PersonalCalendarSheetTrigger({ children, className, ariaLabel, openAdder = false }: { children:ReactNode; className?:string; ariaLabel?:string; openAdder?:boolean }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PersonalCalendarData | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);
  const show = () => startTransition(async () => {
    const next = data ?? await loadPersonalCalendarData();
    if (!next) return;
    setData(next);
    setOpen(true);
  });
  return <>
    <button type="button" className={className} aria-label={ariaLabel} aria-busy={pending} disabled={pending} onClick={show}>{children}</button>
    {open && data && <BodyPortal><div className="personal-calendar-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><section className="personal-calendar-sheet" role="dialog" aria-modal="true" aria-label="Your calendar" onMouseDown={(event) => event.stopPropagation()}><CalendarScreen {...data} sheet openAdder={openAdder} onClose={() => setOpen(false)} /></section></div></BodyPortal>}
  </>;
}
