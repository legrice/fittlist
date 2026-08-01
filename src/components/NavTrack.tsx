"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

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
 * "/sarah/studios" and the legacy "/sarah/schedule"; a studio's adds
 * "/contact", which is still a section there. They're separate routes, but
 * one screen wearing several URLs: the header is identical and only the
 * section below it differs. A back control pointing at "/sarah" should pop
 * off any of them rather than pushing another entry onto the pile.
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
  // Whether the navigation about to be recorded was a step backwards.
  //
  // This used to be guessed from the pathname: landing on the page beneath the
  // top was taken for a back. That guess is wrong exactly where it matters
  // most, because a profile and a class link to each other. Tap into a class
  // and then tap the coach's name and you arrive at a pathname that IS the one
  // beneath, so a genuine step forward was recorded as a step back, the class
  // fell off the stack, and the profile's arrow no longer knew you had come
  // from it.
  //
  // popstate is the fact rather than the guess. It fires for the browser
  // button, for a swipe, and for router.back(), and never for a push.
  //
  // It is only available for a navigation inside this document, though. A back
  // that reloads the page (out of the bfcache, or off a hard-loaded entry)
  // brings up a fresh listener that never saw the event, so the first run
  // after a load still has to guess, and the old pathname test is the best
  // guess there is. After that, popstate is authoritative.
  const popped = useRef(false);
  const first = useRef(true);

  useEffect(() => {
    const onPop = () => {
      popped.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const fresh = first.current;
    first.current = false;
    const popEvent = popped.current;
    // Consumed either way, including on the early return: a popstate that
    // didn't change the path (a hash, a query) must not leave the flag set for
    // whatever navigation comes next.
    popped.current = false;
    const stack = navStack();
    const top = stack[stack.length - 1];
    if (top === pathname) return;
    const wentBack = popEvent || (fresh && stack.length >= 2 && stack[stack.length - 2] === pathname);
    if (wentBack && stack.length >= 2) {
      write(stack.slice(0, -1));
      return;
    }
    write([...stack, pathname]);
  }, [pathname]);

  return null;
}
