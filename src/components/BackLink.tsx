"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { backSteps } from "@/components/NavTrack";

// A "back" navigation: slide the current page out to the right, uncovering
// what's beneath, and flag the previous page to enter from the left — the
// mirror of the forward (slide-in-from-right) push.
export function useSlideBack() {
  const router = useRouter();
  const pathname = usePathname();
  const busy = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    busy.current = false;
    return () => { if (resetTimer.current) clearTimeout(resetTimer.current); };
  }, [pathname]);
  // Use real history for known origins. Cold-open and parent fallbacks
  // replace the current entry so a Back button never creates a new loop.
  return (href?: string, anywhere = false, notUnder?: string) => {
    if (busy.current) return;
    busy.current = true;
    resetTimer.current = setTimeout(() => { busy.current = false; }, 2000);
    const go = () => {
      if (!href) return router.back();
      const steps = backSteps(href, anywhere, notUnder);
      if (steps !== null) return window.history.go(-steps);
      router.replace(href);
    };
    if (typeof window !== "undefined") {
      try { sessionStorage.setItem("fl-nav", "back"); } catch { /* Navigation does not require storage. */ }
      // Begin history navigation on touch. A delayed timer could fire after
      // another route opened, and repeated taps could pop several screens.
    }
    go();
  };
}

export function BackLink({
  href,
  className,
  label,
  anywhere = false,
  notUnder,
  children,
}: {
  /** Omit to go back through history rather than to a known page. */
  href?: string;
  className?: string;
  /** Names the destination when the button itself is only an arrow. */
  label?: string;
  /** Pop to whatever is underneath rather than only to `href`, which becomes
   *  the fallback for a page opened cold. */
  anywhere?: boolean;
  /** With `anywhere`: a URL whose own pages don't count as somewhere you came
   *  from. A profile passes its own base, so it never pops into one of its
   *  classes and back into itself. */
  notUnder?: string;
  children: React.ReactNode;
}) {
  const back = useSlideBack();
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onClick={() => back(href, anywhere, notUnder)}
    >
      {children}
    </button>
  );
}
