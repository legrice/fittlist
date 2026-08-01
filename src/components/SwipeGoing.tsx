"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";

const OPEN = 78; // drag this far and the release commits
const MAX = 120; // past here the row stops following your finger

// Swipe a class row right-to-left to add it to your week or take it back out.
// The panel revealed behind says what the release will do, so the gesture is
// never a guess: green and a check when it will add, muted and an x when it
// will remove.
//
// One word each. The panel is only as wide as the row has been dragged, so
// "Add to your week" got clipped to "d to your week" at the point someone is
// actually reading it.
//
// Pointer events rather than touch: one code path for finger, pen and mouse.
// The first 10px of movement decide who owns the gesture — more horizontal
// than vertical and we take it, otherwise we let go and the page scrolls. The
// row keeps touch-action: pan-y so vertical scrolling never waits on us.
export function SwipeGoing({
  going,
  onToggle,
  children,
}: {
  going: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; own: boolean; decided: boolean } | null>(null);
  // A drag that ends on the row would otherwise fire a click and navigate.
  const swallowClick = useRef(false);

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    swallowClick.current = false;
    start.current = { x: e.clientX, y: e.clientY, own: false, decided: false };
  };

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.decided) {
      if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
      s.decided = true;
      s.own = Math.abs(mx) > Math.abs(my);
      if (!s.own) {
        start.current = null; // a scroll, not a swipe — hands off
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    }
    if (!s.own) return;
    // Leftwards only, so dx is negative and the panel is revealed on the right.
    setDx(Math.max(-MAX, Math.min(mx, 0)));
  };

  const end = () => {
    const s = start.current;
    start.current = null;
    setDragging(false);
    if (s?.own) {
      swallowClick.current = true;
      if (dx <= -OPEN) onToggle();
    }
    setDx(0);
  };

  return (
    <div
      className={`swiperow${dragging ? " dragging" : ""}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      // A row is a link wrapping an avatar, so a press-and-drag would otherwise
      // start Chromium's native link/image drag and swallow the rest of the
      // gesture — the row would follow the first few pixels and then freeze.
      onDragStart={(e) => e.preventDefault()}
      onClickCapture={(e) => {
        if (!swallowClick.current) return;
        e.preventDefault();
        e.stopPropagation();
        swallowClick.current = false;
      }}
    >
      <div
        className={`swipeact${going ? " undo" : ""}${dx <= -OPEN ? " armed" : ""}`}
        style={{ opacity: dx < -4 ? 1 : 0 }}
        aria-hidden="true"
      >
        {/* The same calendar the class pill wears, so a swipe and a tap are
            plainly the same thing done two ways. */}
        <Icon name={going ? "close" : "calendar_today"} size={19} />
        <span>{going ? "Remove" : "Add"}</span>
      </div>
      <div
        className="swipefront"
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? "none" : "transform .22s cubic-bezier(.2,.8,.3,1)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
