"use client";

import { LoadingDots } from "@/components/LoadingDots";


import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { BodyPortal } from "@/components/BodyPortal";
import { CalendarScreen } from "@/components/CalendarScreen";
import { loadPersonalCalendarData, type PersonalCalendarData } from "@/app/actions/calendar-data";
import { loadClientMemory, readClientMemory } from "@/lib/client-memory";
import { motionDuration } from "@/lib/motion";
import { withTimeout } from "@/lib/async";

const PERSONAL_CALENDAR_KEY = "personal-calendar";

export function PersonalCalendarSheetTrigger({ children, className, ariaLabel, openAdder = false, buttonRef }: { children:ReactNode; className?:string; ariaLabel?:string; openAdder?:boolean; buttonRef?:Ref<HTMLButtonElement> }) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<PersonalCalendarData | null>(() => readClientMemory(PERSONAL_CALENDAR_KEY));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const request = useRef(0);
  const showing = useRef(false);
  const historyMarker = useRef(`personal-calendar-${Math.random().toString(36).slice(2)}`);
  const originScrollY = useRef(0);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beginClose = useCallback(() => {
    showing.current = false;
    request.current += 1;
    setVisible(false);
    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(() => {
      setOpen(false);
      window.requestAnimationFrame(() => window.scrollTo(0, originScrollY.current));
    }, motionDuration("sheet"));
  }, []);
  const goBack = useCallback(() => {
    if (window.history.state?.personalCalendarTakeover === historyMarker.current) window.history.back();
    else beginClose();
  }, [beginClose]);
  const refreshCalendar = useCallback(async () => {
    const generation = ++request.current;
    setPending(true);
    setError(null);
    try {
      const fresh = await loadClientMemory(PERSONAL_CALENDAR_KEY, () => withTimeout(loadPersonalCalendarData()));
      if (generation !== request.current) return;
      if (!fresh) { setError("Your session expired. Sign in again to load your calendar."); return; }
      setData(fresh);
    } catch {
      if (generation === request.current) setError("Your calendar couldn’t refresh. Check your connection and try again.");
    } finally {
      if (generation === request.current) setPending(false);
    }
  }, []);
  useEffect(() => {
    if (!open) return;
    const enterFrame = window.requestAnimationFrame(() => setVisible(true));
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector(".share-takeover-scrim")) goBack();
    };
    const closeOnPop = () => {
      if (!document.querySelector(".share-takeover-scrim")) beginClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("popstate", closeOnPop);
    return () => {
      window.cancelAnimationFrame(enterFrame);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("popstate", closeOnPop);
    };
  }, [open, goBack, beginClose]);
  useEffect(() => () => {
    request.current += 1;
    if (exitTimer.current) clearTimeout(exitTimer.current);
  }, []);
  useEffect(() => {
    const refresh = () => { if (showing.current) void refreshCalendar(); };
    window.addEventListener("fittlist:calendar-data-changed", refresh);
    return () => window.removeEventListener("fittlist:calendar-data-changed", refresh);
  }, [refreshCalendar]);
  const show = () => {
    if (showing.current) return;
    showing.current = true;
    if (exitTimer.current) clearTimeout(exitTimer.current);
    originScrollY.current = window.scrollY;
    window.history.pushState({ ...(window.history.state ?? {}), personalCalendarTakeover:historyMarker.current }, "", window.location.href);
    setData(readClientMemory(PERSONAL_CALENDAR_KEY));
    setVisible(false);
    setOpen(true);
    void refreshCalendar();
  };
  return <>
    <button ref={buttonRef} type="button" className={className} aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} onClick={show}>{children}</button>
    {open && <BodyPortal><div className="personal-calendar-scrim"><section className={`personal-calendar-sheet${visible ? " is-open" : ""}`} role="dialog" aria-modal="true" aria-label="Your calendar">
      {error && <div className="pad" role="status"><p>{error}</p><button className="btn" onClick={() => void refreshCalendar()} disabled={pending}>Try again</button> <Link href="/">Sign in</Link></div>}
      {data ? <CalendarScreen {...data} sheet openAdder={openAdder} onClose={goBack} /> : <div className="pad"><button type="button" className="ghost" onClick={goBack}>Close calendar</button><h2>Your calendar</h2>{pending && <p role="status"><LoadingDots label="Loading your calendar…"/></p>}</div>}
    </section></div></BodyPortal>}
  </>;
}
