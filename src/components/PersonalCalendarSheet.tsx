"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { BodyPortal } from "@/components/BodyPortal";
import { CalendarScreen } from "@/components/CalendarScreen";
import { loadPersonalCalendarData, type PersonalCalendarData } from "@/app/actions/calendar-data";

export function PersonalCalendarSheetTrigger({ children, className, ariaLabel, openAdder = false }: { children:ReactNode; className?:string; ariaLabel?:string; openAdder?:boolean }) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<PersonalCalendarData | null>(null);
  const [pending, startTransition] = useTransition();
  const historyMarker = useRef(`personal-calendar-${Math.random().toString(36).slice(2)}`);
  const originScrollY = useRef(0);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishClose = () => {
    setOpen(false);
    window.requestAnimationFrame(() => window.scrollTo(0, originScrollY.current));
  };
  const beginClose = () => {
    setVisible(false);
    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(finishClose, 240);
  };
  const goBack = () => {
    if (window.history.state?.personalCalendarTakeover === historyMarker.current) window.history.back();
    else beginClose();
  };
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const enterFrame = window.requestAnimationFrame(() => setVisible(true));
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") goBack(); };
    const closeOnPop = () => beginClose();
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("popstate", closeOnPop);
    return () => {
      window.cancelAnimationFrame(enterFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("popstate", closeOnPop);
    };
  }, [open]);
  useEffect(() => () => {
    if (exitTimer.current) clearTimeout(exitTimer.current);
  }, []);
  const show = () => startTransition(async () => {
    const next = data ?? await loadPersonalCalendarData();
    if (!next) return;
    originScrollY.current = window.scrollY;
    window.history.pushState({ ...(window.history.state ?? {}), personalCalendarTakeover:historyMarker.current }, "", window.location.href);
    setData(next);
    setVisible(false);
    setOpen(true);
  });
  return <>
    <button type="button" className={className} aria-label={ariaLabel} aria-busy={pending} disabled={pending} onClick={show}>{children}</button>
    {open && data && <BodyPortal><div className="personal-calendar-scrim"><section className={`personal-calendar-sheet${visible ? " is-open" : ""}`} role="dialog" aria-modal="true" aria-label="Your calendar"><CalendarScreen {...data} sheet openAdder={openAdder} onClose={goBack} /></section></div></BodyPortal>}
  </>;
}
