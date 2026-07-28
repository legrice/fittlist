"use client";

import { useLinkStatus } from "next/link";

// Drop inside any <Link> to show that the tap landed.
//
// Every screen here is force-dynamic, so Next can't prefetch the payload and
// each tap is a real round trip. The press state ends when the finger lifts,
// which leaves a gap where nothing at all is happening on screen and the tap
// reads as missed. This fills that gap.
//
// It only renders after a beat: a navigation that resolves quickly should look
// instant, not flash a spinner on the way.
export function LinkPending({ className = "" }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span className={`tapspin ${className}`.trim()} aria-hidden="true" />;
}
