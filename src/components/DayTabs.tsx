"use client";

import { useEffect, useRef, useState } from "react";

// Sticky, horizontally-scrolling day tabs that anchor-scroll to each day's
// section below and underline the day currently in view (scroll-spy).
export function DayTabs({ days }: { days: { id: string; label: string }[] }) {
  const [active, setActive] = useState(days[0]?.id ?? "");
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = document.querySelector(".stage");
    if (!stage) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // the last section whose heading has scrolled up past the sticky tabs
        let current = days[0]?.id ?? "";
        for (const d of days) {
          const el = document.getElementById(d.id);
          if (el && el.getBoundingClientRect().top - 96 <= 0) current = d.id;
        }
        setActive(current);
      });
    };
    stage.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      stage.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [days]);

  // keep the active tab centered within the strip — scroll only the strip
  // horizontally so it can never nudge the page's vertical scroll.
  useEffect(() => {
    const strip = stripRef.current;
    const tab = strip?.querySelector<HTMLElement>(`[data-tab="${active}"]`);
    if (!strip || !tab) return;
    const target = tab.offsetLeft - strip.clientWidth / 2 + tab.offsetWidth / 2;
    strip.scrollTo({ left: target, behavior: "smooth" });
  }, [active]);

  const go = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="daytabs" ref={stripRef}>
      {days.map((d) => (
        <button
          key={d.id}
          data-tab={d.id}
          className={`daytab${active === d.id ? " active" : ""}`}
          onClick={() => go(d.id)}
        >
          {d.label}
        </button>
      ))}
    </div>
  );
}
