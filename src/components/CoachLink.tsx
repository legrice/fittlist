"use client";

import { useSlideBack } from "@/components/BackLink";

// Tapping the coach's name on a class page goes up to their profile, which is
// where you came from more often than not — so it plays the back transition
// (out to the left, in from the right) rather than the forward one.
export function CoachLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const back = useSlideBack();
  return (
    <button type="button" className={className} onClick={() => back(href)}>
      {children}
    </button>
  );
}
