"use client";

import { useRouter } from "next/navigation";
import { pageBeneath, samePage } from "@/components/NavTrack";

// A "back" navigation: slide the current page out to the right, uncovering
// what's beneath, and flag the previous page to enter from the left — the
// mirror of the forward (slide-in-from-right) push.
export function useSlideBack() {
  const router = useRouter();
  // No href means we don't know the destination by name — walk the history
  // instead, which is literally "where you tapped this from".
  //
  // With one, we pop if the page beneath is that destination and push if it
  // isn't. Pushing unconditionally is what made the coach page and a class
  // page trap you: both of them link to each other, so every "back" tap added
  // a step and the browser button could only walk back through the pile.
  //
  // `anywhere` widens that: pop to whatever is underneath whether or not it
  // matches, and use the href only when nothing is. That is what a profile's
  // arrow means now that it is the only way off the page: back to wherever you
  // came from, and to the app's front door on a cold open, where "wherever you
  // came from" is somebody else's website.
  //
  // `notUnder` is what stops that becoming a trap. A class belongs to the
  // profile it hangs off, and its own back points at that profile, so a
  // profile that pops into one of its own classes bounces forever: open a
  // class link cold, tap the coach, tap back, and you are on the class again
  // with nothing but the same two taps available. A page underneath that lives
  // inside this one is not somewhere you came from, it is somewhere you went,
  // so the arrow steps over it to the named destination instead.
  return (href?: string, anywhere = false, notUnder?: string) => {
    const go = () => {
      if (!href) return router.back();
      const beneath = pageBeneath();
      if (anywhere) {
        const mine = !!beneath && !!notUnder && (beneath === notUnder || beneath.startsWith(`${notUnder}/`));
        if (beneath && !mine) return router.back();
        return router.push(href);
      }
      // A destination carrying a query string is a different screen from the
      // bare one ("/app?acct=1" opens the account overlay), so it never counts
      // as already being underneath.
      if (beneath && !href.includes("?") && samePage(beneath, href)) return router.back();
      router.push(href);
    };
    if (typeof window !== "undefined") {
      sessionStorage.setItem("fl-nav", "back");
      const el = document.querySelector(".page-slide");
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (el && !reduce) {
        el.classList.add("exit-right");
        window.setTimeout(go, 210);
        return;
      }
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
