"use client";

import { useEffect, useRef } from "react";

// Fires a server action once, after the page is on screen.
//
// "Opening this page marks it read" used to run during the server render,
// which was fine until the client router started keeping rendered pages for
// 30 seconds: a mutation buried in a GET can't revalidate anything, so the
// list you came from kept showing the unread you had just read. As an action
// it can, and the render stays a render.
export function MarkSeen({ action }: { action: () => Promise<void> }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    action().catch(() => {
      /* a failed mark-read fixes itself on the next open */
    });
  }, [action]);
  return null;
}
