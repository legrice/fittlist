"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/** How long the mark stays lit. Long enough to find, short enough that it
 *  never becomes part of how the row looks. */
const HOLD_MS = 3000;

/**
 * "See it" lands here, so here is where the class it means gets pointed at.
 *
 * The note that answers an add offers a way to the week it joined, and a week
 * is a long list: arriving at the top of it and hunting for the row you just
 * added is the same work the note was supposed to save. `?hl={classId}.{iso}`
 * names the occurrence, and this lights it for three seconds and scrolls it
 * into view.
 *
 * It works off the DOM rather than threading a prop through the list, because
 * the rows already carry the two keys as data attributes for ClassOpener, and
 * the highlight is a moment rather than a piece of state the week owns.
 */
export function HighlightOnLand() {
  const params = useSearchParams();
  const hl = params.get("hl");
  useEffect(() => {
    if (!hl) return;
    const dot = hl.lastIndexOf(".");
    if (dot < 1) return;
    const cid = hl.slice(0, dot);
    const iso = hl.slice(dot + 1);
    const sel = `[data-cid="${CSS.escape(cid)}"][data-d="${CSS.escape(iso)}"]`;
    let stop = false;
    let clear: ReturnType<typeof setTimeout> | null = null;
    // The week arrives from the server, so the row this is looking for is
    // usually not painted on the first frame after a tap. One frame was what
    // this did and it silently found nothing every time; it waits for the
    // row instead, and gives up rather than watching forever.
    const deadline = Date.now() + 4000;
    const look = () => {
      if (stop) return;
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) {
        if (Date.now() < deadline) requestAnimationFrame(look);
        return;
      }
      // The wrapper, not the anchor: the ribbon and the remove control are
      // siblings of the row, so lighting the row alone would leave them out.
      const row = el.closest<HTMLElement>(".ps-erow") ?? el;
      row.classList.add("ps-hl");
      row.scrollIntoView({ block: "center", behavior: "smooth" });
      clear = setTimeout(() => row.classList.remove("ps-hl"), HOLD_MS);
    };
    look();
    return () => {
      stop = true;
      if (clear) clearTimeout(clear);
    };
  }, [hl]);
  return null;
}
