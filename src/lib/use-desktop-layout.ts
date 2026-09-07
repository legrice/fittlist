"use client";

import { useSyncExternalStore } from "react";

// Keep this aligned with the app frame and mobile navigation in globals.css.
const DESKTOP_QUERY = "(min-width: 940px)";

export function isDesktopViewport() {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches;
}

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useDesktopLayout() {
  return useSyncExternalStore(subscribe, isDesktopViewport, () => false);
}
