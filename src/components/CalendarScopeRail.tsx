"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";

export function CalendarScopeRail({ children }: { children: ReactNode }) {
  const rail = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const update = () => {
      const left = element.scrollLeft > 2;
      const right = element.scrollLeft + element.clientWidth < element.scrollWidth - 2;
      setEdges(previous => previous.left === left && previous.right === right ? previous : { left, right });
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => { element.removeEventListener("scroll", update); observer.disconnect(); };
  }, [children]);
  const move = (direction: number) => {
    const element = rail.current;
    if (!element) return;
    element.scrollBy({ left: direction * Math.max(120, element.clientWidth * .75), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  return <div className={`calendar-scope-carousel${edges.left ? " can-scroll-left" : ""}${edges.right ? " can-scroll-right" : ""}`}>
    <div ref={rail} className="calendar-scope-row" aria-label="Calendar scope">{children}</div>
    <button type="button" className="calendar-rail-arrow calendar-rail-left" aria-label="Scroll calendars left" disabled={!edges.left} onClick={() => move(-1)}><Icon name="chevron_left" size={22}/></button>
    <button type="button" className="calendar-rail-arrow calendar-rail-right" aria-label="Scroll calendars right" disabled={!edges.right} onClick={() => move(1)}><Icon name="chevron_right" size={22}/></button>
  </div>;
}
