"use client";

import { useRouter } from "next/navigation";

// A "back" navigation: slide the current page out to the right, uncovering
// what's beneath, and flag the previous page to enter from the left — the
// mirror of the forward (slide-in-from-right) push.
export function useSlideBack() {
  const router = useRouter();
  // No href means we don't know the destination by name — walk the history
  // instead, which is literally "where you tapped this from".
  return (href?: string) => {
    const go = () => (href ? router.push(href) : router.back());
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
  children,
}: {
  /** Omit to go back through history rather than to a known page. */
  href?: string;
  className?: string;
  /** Names the destination when the button itself is only an arrow. */
  label?: string;
  children: React.ReactNode;
}) {
  const back = useSlideBack();
  return (
    <button type="button" className={className} aria-label={label} onClick={() => back(href)}>
      {children}
    </button>
  );
}
