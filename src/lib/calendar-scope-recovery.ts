"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** A cancelled/stalled RSC navigation must not strand the outgoing sheet.
 * Keep the normal client transition fast; recover with one document request
 * only if its URL has not changed after eight seconds. */
export function useCalendarScopeRecovery(target: "you" | "following", current: "you" | "following", reset: () => void) {
  const pathname = usePathname();
  useEffect(() => { reset(); }, [pathname, reset]);
  useEffect(() => {
    if (target === current) return;
    const source = current === "you" ? "/calendar" : "/calendar/following";
    const destination = target === "you" ? "/calendar" : "/calendar/following";
    const timer = window.setTimeout(() => {
      if (window.location.pathname !== source) return;
      if (!navigator.onLine) { reset(); return; }
      window.location.assign(destination);
    }, 8000);
    const offline = () => reset();
    const restored = () => { window.clearTimeout(timer); reset(); };
    window.addEventListener("offline", offline);
    window.addEventListener("popstate", restored);
    window.addEventListener("pagehide", restored);
    window.addEventListener("beforeunload", restored);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("offline", offline);
      window.removeEventListener("popstate", restored);
      window.removeEventListener("pagehide", restored);
      window.removeEventListener("beforeunload", restored);
    };
  }, [target, current, reset]);
}
