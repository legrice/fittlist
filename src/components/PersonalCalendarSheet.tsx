"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode, type TouchEvent } from "react";
import { BodyPortal } from "@/components/BodyPortal";
import { CalendarScreen } from "@/components/CalendarScreen";
import { loadPersonalCalendarData, type PersonalCalendarData } from "@/app/actions/calendar-data";

export function PersonalCalendarSheetTrigger({ children, className, ariaLabel, openAdder = false }: { children:ReactNode; className?:string; ariaLabel?:string; openAdder?:boolean }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PersonalCalendarData | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const sheetRef = useRef<HTMLElement>(null);
  const dragStartY = useRef<number | null>(null);
  const [pending, startTransition] = useTransition();
  const close = () => { setOpen(false); setDragY(0); setDragging(false); dragStartY.current = null; };
  const startPull = (event: TouchEvent<HTMLElement>) => {
    if ((sheetRef.current?.scrollTop ?? 0) > 0) return;
    dragStartY.current = event.touches[0]?.clientY ?? null;
  };
  const movePull = (event: TouchEvent<HTMLElement>) => {
    if (dragStartY.current === null || (sheetRef.current?.scrollTop ?? 0) > 0) return;
    const distance = Math.max(0, (event.touches[0]?.clientY ?? dragStartY.current) - dragStartY.current);
    if (distance === 0) return;
    event.preventDefault();
    setDragging(true);
    setDragY(distance);
  };
  const endPull = () => {
    if (dragY > 90) close();
    else { setDragY(0); setDragging(false); dragStartY.current = null; }
  };
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
    {open && data && <BodyPortal><div className="personal-calendar-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section ref={sheetRef} className={`personal-calendar-sheet${dragging ? " is-pulling" : ""}`} style={{ transform:`translateY(${dragY}px)` }} role="dialog" aria-modal="true" aria-label="Your calendar" onMouseDown={(event) => event.stopPropagation()} onTouchStart={startPull} onTouchMove={movePull} onTouchEnd={endPull} onTouchCancel={endPull}><CalendarScreen {...data} sheet openAdder={openAdder} onClose={close} /></section></div></BodyPortal>}
  </>;
}
