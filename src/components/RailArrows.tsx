"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";

// Arrows for a rail that runs off the edge of the screen.
//
// A finger just swipes the coach strip, so on a phone the cut-off avatar is
// the whole affordance. A mouse has no such move: on a desktop the row simply
// ends, and the coaches past the edge may as well not exist. These sit over
// that edge and page the rail along.
//
// Only on a pointer that can hover, which is the honest test for "can't
// swipe". A width breakpoint would put them on a tablet, where they're noise.
export function RailArrows({ railRef }: { railRef: React.RefObject<HTMLDivElement | null> }) {
  const [left, setLeft] = useState(false);
  const [right, setRight] = useState(false);
  const raf = useRef(0);

  const measure = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    // A pixel of slack: fractional scroll widths otherwise leave an arrow lit
    // at the end of the rail with nothing left to scroll to.
    setLeft(el.scrollLeft > 1);
    setRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, [railRef]);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    measure();
    const onScroll = () => {
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(measure);
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    // The rail's own box stays put while its contents change width, so watch
    // the children too: a name label reflows when the webfont swaps in, and
    // that alone decides whether anything is off the edge.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    const mo = new MutationObserver(() => {
      for (const child of Array.from(el.children)) ro.observe(child);
      measure();
    });
    mo.observe(el, { childList: true });
    document.fonts?.ready.then(measure).catch(() => {});

    return () => {
      cancelAnimationFrame(raf.current);
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      mo.disconnect();
    };
  }, [measure, railRef]);

  // Just under a screenful, so the avatar you were looking at stays in view
  // and you never lose your place between taps.
  const page = (dir: -1 | 1) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <>
      {left && (
        <button type="button" className="railarrow railarrow-l" aria-label="Scroll left" onClick={() => page(-1)}>
          <Icon name="chevron_left" size={24} />
        </button>
      )}
      {right && (
        <button type="button" className="railarrow railarrow-r" aria-label="Scroll right" onClick={() => page(1)}>
          <Icon name="chevron_right" size={24} />
        </button>
      )}
    </>
  );
}
