"use client";

import { useRouter } from "next/navigation";

// A "back" navigation: slide the current public page out to the right, flag the
// next page to enter from the left, then navigate — the reverse of the
// forward (slide-in-from-right) transition.
export function useSlideBack() {
  const router = useRouter();
  return (href: string) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("fl-nav", "back");
      const el = document.querySelector(".page-slide");
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (el && !reduce) {
        el.classList.add("exit-right");
        window.setTimeout(() => router.push(href), 210);
        return;
      }
    }
    router.push(href);
  };
}

export function BackLink({
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
