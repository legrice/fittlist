"use client";

import { useCallback, useEffect, useState } from "react";
import { useDesktopLayout, isDesktopViewport } from "@/lib/use-desktop-layout";
import { usePathname, useRouter } from "next/navigation";

const KEY = "fittlistSearch";
type SearchEntry = { userId: string; pathname: string; open: boolean; query: string };

export function readSearchHistory(userId: string): SearchEntry | null {
  if (typeof window === "undefined") return null;
  const saved = window.history.state?.[KEY];
  return saved?.userId === userId && saved.pathname === window.location.pathname && typeof saved.open === "boolean" && typeof saved.query === "string"
    ? saved as SearchEntry : null;
}

export function writeSearchQuery(userId: string, query: string) {
  const saved = readSearchHistory(userId);
  if (!saved?.open) return;
  window.history.replaceState({ ...window.history.state, [KEY]: { ...saved, query } }, "");
}

/** Save sheet state on its existing history entry, without adding a Back step. */
export function useSearchHistory(userId: string) {
  const pathname = usePathname();
  const router = useRouter();
  const desktop = useDesktopLayout();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const restore = () => setOpen(readSearchHistory(userId)?.open ?? false);
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [pathname, userId]);
  const change = useCallback((next: boolean) => {
    if (next && isDesktopViewport()) { router.push("/search"); return; }
    const previous = readSearchHistory(userId);
    window.history.replaceState({ ...window.history.state, [KEY]: {
      userId, pathname: window.location.pathname, open: next, query: next ? previous?.query ?? "" : "",
    } }, "");
    setOpen(next);
  }, [userId, router]);
  return [open && !desktop, change] as const;
}
