"use client";

import { useEffect, useRef } from "react";
import { haptic } from "@/lib/haptics";
import { resistedSheetDistance, sheetShouldDismiss } from "@/lib/motion";

/** Both front sheets share the same two resting states. Movement touches only
 * compositor styles, not React's calendar tree. Native non-passive listeners
 * claim downward pulls only at the top; upward/horizontal scrolling stays native. */
export function useFrontSheet(enabled: boolean, onDismiss: () => void) {
  const sheetRef = useRef<HTMLElement>(null);
  const scopeRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!enabled || !sheet) return;
    let gesture: { x: number; y: number; lastY: number; time: number; velocity: number; distance: number; active: boolean; crossed: boolean } | null = null;
    let frame = 0;
    let suppressClick = false;
    const paint = () => {
      frame = 0;
      const distance = gesture?.distance ?? 0;
      sheet.style.transform = `translateY(${resistedSheetDistance(distance)}px)`;
      scopeRef.current?.style.setProperty("--sheet-pull-progress", String(Math.min(distance / 120, 1)));
      scopeRef.current?.style.setProperty("--sheet-search-scale", String(1 - .12 * Math.min(distance / 120, 1)));
    };
    const reset = () => {
      gesture = null;
      if (frame) cancelAnimationFrame(frame);
      sheet.classList.remove("is-pulling");
      paint();
    };
    const start = (event: TouchEvent) => {
      reset();
      suppressClick = false;
      if (event.touches.length !== 1 || window.scrollY > 4) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=slider]")) return;
      for (let node = target; node && node !== sheet; node = node.parentElement) {
        if (node.scrollTop > 0) return;
      }
      const touch = event.touches[0];
      gesture = { x: touch.clientX, y: touch.clientY, lastY: touch.clientY, time: event.timeStamp, velocity: 0, distance: 0, active: false, crossed: false };
    };
    const move = (event: TouchEvent) => {
      if (!gesture) return;
      if (event.touches.length !== 1) { reset(); return; }
      const touch = event.touches[0];
      const dy = touch.clientY - gesture.y;
      if (!gesture.active) {
        if (Math.abs(touch.clientX - gesture.x) > 8 || dy < -8) { reset(); return; }
        if (dy < 8) return;
        if (!event.cancelable) { reset(); return; }
        gesture.active = true;
        sheet.classList.add("is-pulling");
      }
      if (event.cancelable) event.preventDefault();
      const elapsed = event.timeStamp - gesture.time;
      if (elapsed > 0) gesture.velocity = (touch.clientY - gesture.lastY) / elapsed;
      gesture.time = event.timeStamp;
      gesture.lastY = touch.clientY;
      gesture.distance = Math.max(0, dy);
      if (dy >= 120 && !gesture.crossed) { gesture.crossed = true; haptic(); }
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const end = (event: TouchEvent) => {
      if (!gesture) return;
      suppressClick = gesture.active;
      const velocity = event.timeStamp - gesture.time < 100 ? gesture.velocity : 0;
      const dismiss = event.type !== "touchcancel" && gesture.active && sheetShouldDismiss(gesture.distance, velocity);
      if (dismiss && !gesture.crossed) haptic();
      reset();
      if (dismiss) dismissRef.current();
    };
    const click = (event: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };
    sheet.addEventListener("touchstart", start, { passive: true });
    sheet.addEventListener("touchmove", move, { passive: false });
    sheet.addEventListener("touchend", end);
    sheet.addEventListener("touchcancel", end);
    sheet.addEventListener("click", click, true);
    return () => {
      reset();
      sheet.removeEventListener("touchstart", start);
      sheet.removeEventListener("touchmove", move);
      sheet.removeEventListener("touchend", end);
      sheet.removeEventListener("touchcancel", end);
      sheet.removeEventListener("click", click, true);
    };
  }, [enabled]);
  return { sheetRef, scopeRef };
}
