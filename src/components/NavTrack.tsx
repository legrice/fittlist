"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// A record of the pages you've walked through in this tab.
//
// Every "back" control in the app knows where it points but not whether that
// page is actually behind you, so they all pushed. A push labelled back is how
// you get a loop: tap into a class, tap the coach's name, and Back walks you
// between the two forever because history only ever grew.
//
// This keeps a small stack so those controls can pop instead. Pathnames only,
// which is deliberate: a destination carrying a query string ("/app?acct=1"
// opens the account overlay) is a different page from the bare one and must
// never be satisfied by popping to it.

const KEY = "fl-hist";
const MAX = 20;

export function navStack(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === "string") : [];
  } catch {
    return [];
  }
}

/** The page underneath the one you're on, if we know it. */
export function pageBeneath(): string | null {
  const stack = navStack();
  return stack.length >= 2 ? stack[stack.length - 2] : null;
}

/**
 * One screen, whatever it's calling itself.
 *
 * A coach's page answers to "/sarah" (the schedule), "/sarah/about",
 * "/sarah/studios", "/sarah/contact" and the legacy "/sarah/schedule".
 * They're separate routes now, but they're still one screen wearing three
 * URLs: the header is identical and only the section below it differs. A back
 * control pointing at "/sarah" should pop off any of them rather than pushing
 * a fourth entry onto the pile.
 */
export function samePage(a: string, b: string): boolean {
  const bare = (u: string) => u.replace(/\/(schedule|about|studios|contact)$/, "") || "/";
  return a === b || bare(a) === bare(b);
}

function write(stack: string[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(stack.slice(-MAX)));
  } catch {
    // A full or blocked sessionStorage just means back controls keep pushing.
  }
}

export function NavTrack() {
  const pathname = usePathname();

  useEffect(() => {
    const stack = navStack();
    const top = stack[stack.length - 1];
    if (top === pathname) return;
    // Landing on the page beneath the top means we went back, however that
    // happened: our own control, the browser button, or a swipe. Drop the tip
    // rather than recording the same page twice.
    if (stack.length >= 2 && stack[stack.length - 2] === pathname) {
      write(stack.slice(0, -1));
      return;
    }
    write([...stack, pathname]);
  }, [pathname]);

  return null;
}
