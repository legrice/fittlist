"use client";

import { useLayoutEffect, useRef } from "react";

// Wrapping the public [handle] segment in a template makes it re-mount on each
// navigation, so the page slides in. Forward navigations enter from the left
// (the base animation); a "back" tap sets a flag so this page enters from the
// right instead - the reverse motion.
export default function Template({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("fl-nav") === "back") {
      ref.current?.classList.add("from-right");
      sessionStorage.removeItem("fl-nav");
    }
  }, []);
  return (
    <div className="page-slide" ref={ref}>
      {children}
    </div>
  );
}
