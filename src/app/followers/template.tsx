"use client";

import { useLayoutEffect, useRef } from "react";

// Same push/pop motion as the public pages: forward navigations enter from the
// right, a "back" tap flags this page to enter from the left instead.
export default function Template({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("fl-nav") === "back") {
      ref.current?.classList.add("from-left");
      sessionStorage.removeItem("fl-nav");
    }
  }, []);
  return (
    <div className="page-slide" ref={ref}>
      {children}
    </div>
  );
}
