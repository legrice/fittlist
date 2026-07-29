"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";
import { samePage } from "@/components/NavTrack";

// Wrapping the public [handle] segment in a template makes it re-mount on each
// navigation, so the page slides in. Forward navigations enter from the right
// (the base animation); a "back" tap sets a flag so this page enters from the
// left instead - the reverse motion.
//
// Except between the tabs of one profile. Those are separate routes now, so the
// template remounts and would slide the whole page for what reads as switching
// a section: the photo, the name and the buttons above are identical either
// way, and sliding them out and back in claims a journey happened when none
// did. Module scope rather than a ref, because the remount is the point: a ref
// would be fresh every time and never know where we came from.
let lastPath: string | null = null;

export default function Template({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const cameFrom = useRef<string | null>(null);
  if (cameFrom.current === null) cameFrom.current = lastPath;
  const staySeated = !!cameFrom.current && samePage(cameFrom.current, path);

  useEffect(() => {
    lastPath = path;
  }, [path]);

  useLayoutEffect(() => {
    if (typeof window === "undefined" || staySeated) return;
    if (sessionStorage.getItem("fl-nav") === "back") {
      ref.current?.classList.add("from-left");
      sessionStorage.removeItem("fl-nav");
    }
  }, [staySeated]);

  return (
    <div className={`page-slide${staySeated ? " no-slide" : ""}`} ref={ref}>
      {children}
    </div>
  );
}
