"use client";

import { useEffect } from "react";

// Track actual browser entries, including query changes and replacements.
// Pathname-only tracking cannot tell a Back from a Forward, or count the
// calendar's month entries when returning to the page that opened it.
const KEY = "fl-history-v2";
const STATE_KEY = "__flNavigationKey";
const MAX = 100;
type Entry = { key: string; url: string };
let entries: Entry[] = [];
let current = -1;
const localUrl = () => `${location.pathname}${location.search}${location.hash}`;
const pathnameOf = (url: string) => url.split(/[?#]/)[0];

function persist() {
  try { sessionStorage.setItem(KEY, JSON.stringify(entries)); } catch { /* In-memory tracking still works. */ }
}

/** One screen, including the older URLs for its profile sections. */
export function samePage(a: string, b: string): boolean {
  const bare = (url: string) => pathnameOf(url).replace(/\/(schedule|about|studios|coaches|contact)$/, "") || "/";
  return a === b || bare(a) === bare(b);
}

/** Number of actual browser entries back to an eligible destination. */
export function backSteps(href: string, anywhere: boolean, notUnder?: string): number | null {
  if (typeof window === "undefined" || entries[current]?.key !== history.state?.[STATE_KEY]) return null;
  const here = location.pathname;
  for (let i = current - 1; i >= 0; i--) {
    const path = pathnameOf(entries[i].url);
    // Month/filter changes are still the same page. A parent's Back must
    // also skip its own child tools, even when they were opened directly.
    if (path === here || (notUnder && (path === notUnder || path.startsWith(`${notUnder}/`)))) continue;
    if (anywhere || (href.includes("?") ? entries[i].url === href : samePage(path, href))) return current - i;
    return null;
  }
  return null;
}

export function NavTrack() {
  useEffect(() => {
    const push = history.pushState;
    const replace = history.replaceState;
    const newKey = () => crypto.randomUUID();
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(KEY) || "[]");
      entries = Array.isArray(saved) ? saved.filter((entry): entry is Entry => !!entry && typeof entry.key === "string" && typeof entry.url === "string" && entry.url.startsWith("/") && !entry.url.startsWith("//")) : [];
    } catch { entries = []; }
    current = entries.findIndex(entry => entry.key === history.state?.[STATE_KEY]);
    const adopt = () => {
      const key = newKey();
      // Unknown history is a cold entry, not a reason to guess an origin.
      entries = [{ key, url: localUrl() }];
      current = 0;
      replace.call(history, { ...history.state, [STATE_KEY]: key }, "");
      persist();
    };
    if (current < 0) adopt();
    else { entries[current].url = localUrl(); persist(); }

    const trackedPush: History["pushState"] = function(this: History, data, unused, url) {
      const key = newKey();
      push.call(this, { ...data, [STATE_KEY]: key }, unused, url);
      entries = [...entries.slice(0, current + 1), { key, url: localUrl() }].slice(-MAX);
      current = entries.length - 1;
      persist();
    };
    const trackedReplace: History["replaceState"] = function(this: History, data, unused, url) {
      const key = entries[current]?.key ?? newKey();
      replace.call(this, { ...data, [STATE_KEY]: key }, unused, url);
      if (current < 0) { entries = [{ key, url: localUrl() }]; current = 0; }
      else entries[current] = { key, url: localUrl() };
      persist();
    };
    const onPop = () => {
      current = entries.findIndex(entry => entry.key === history.state?.[STATE_KEY]);
      if (current < 0) adopt();
      else { entries[current].url = localUrl(); persist(); }
    };
    history.pushState = trackedPush;
    history.replaceState = trackedReplace;
    window.addEventListener("popstate", onPop);
    return () => {
      if (history.pushState === trackedPush) history.pushState = push;
      if (history.replaceState === trackedReplace) history.replaceState = replace;
      window.removeEventListener("popstate", onPop);
    };
  }, []);
  return null;
}
