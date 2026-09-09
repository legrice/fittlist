"use client";

import { useLinkStatus } from "next/link";

// Inline acknowledgement while a link navigation is pending.
export function LinkPending({ className = "" }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span className={`link-pending-dots ${className}`.trim()} role="status" aria-label="Loading page"><span/><span/><span/></span>;
}
