"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";

// The calendar's chrome, shared by both calendars (a coach's /app, a member's
// /week) so the two stay one thing: the month as the title with the view menu
// beside it, the kind checkmarks that replaced the slice tabs, and the Month
// grid itself. The List view stays each screen's own markup; these are the
// parts around it.

/** Your relationship to a row, which is also its colour. */
export type CalKind = "coaching" | "added" | "private";

export const KIND_LABEL: Record<CalKind, string> = {
  coaching: "Teaching",
  added: "Going",
  private: "Personal",
};

/** Which views exist so far. Day and Week join in phase two. */
export type CalView = "list" | "month";

const VIEW_KEY = "fl-cal-view";

/** The remembered view: a preference, not a filter, so it survives arrival. */
export function loadCalView(): CalView {
  if (typeof window === "undefined") return "list";
  return localStorage.getItem(VIEW_KEY) === "month" ? "month" : "list";
}
export function saveCalView(v: CalView) {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* private mode */
  }
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-08" -> "August" (with the year once it isn't this year's). */
export function monthLabel(ym: string, todayIso: string) {
  const [y, m] = ym.split("-").map(Number);
  const thisYear = Number(todayIso.slice(0, 4));
  return y === thisYear ? MONTHS[m - 1] : `${MONTHS[m - 1]} ${y}`;
}

/** The one persistent door under every calendar view: Share, centred. It
 *  replaced the Today button (the list starts at today, and the month has
 *  its chevrons) and the floating plus, which went back up beside the
 *  month. Sharing your week is the habit the whole app leans on, so it is
 *  the thing that never scrolls away. */
export function CalBottomBar({
  raised = true,
  onShare,
}: {
  /** Sitting above a tab bar, or on a screen without one. */
  raised?: boolean;
  onShare: () => void;
}) {
  const lift = raised ? "" : " calfabs-low";
  return (
    <button className={`sharefab${lift}`} onClick={onShare}>
      <Icon name="ios_share" size={16} /> Share
    </button>
  );
}

/** The calendar's header as one sticky block: the month row and the kind
 *  checkmarks pin under the app header, with the divider underneath them,
 *  so the list scrolls beneath the chrome. The offset is the brandbar's
 *  measured height, because the brandbar is itself sticky and the two must
 *  not overlap. */
export function CalSticky({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bb = document.querySelector<HTMLElement>(".brandbar");
    if (bb && ref.current) ref.current.style.top = `${bb.offsetHeight}px`;
  }, []);
  return (
    <div ref={ref} className="calsticky">
      {children}
    </div>
  );
}

/** The title row: the month where "Your schedule" was, the circled menu that
 *  opens the view sheet, and whatever the caller puts across from them (the
 *  Add pill). */
export function CalHead({
  label,
  onMenu,
  children,
}: {
  label: string;
  onMenu: () => void;
  children: ReactNode;
}) {
  return (
    <div className="calhead-row">
      {/* The menu leads, the month follows: the same order the reference
          calendars keep, and the circle reads as the row's handle. */}
      <button className="calmenu" aria-label="Calendar views" onClick={onMenu}>
        <Icon name="menu" size={17} />
      </button>
      <h2 className="calhead">{label}</h2>
      <span className="calhead-spacer" />
      {children}
    </div>
  );
}

/** The view switcher: a bottom sheet, one row per way of looking. */
export function ViewSheet({
  view,
  onPick,
  onClose,
}: {
  view: CalView;
  onPick: (v: CalView) => void;
  onClose: () => void;
}) {
  const rows: { v: CalView; icon: string; label: string; sub: string }[] = [
    { v: "list", icon: "list", label: "List", sub: "Your days as a list, from today" },
    { v: "month", icon: "calendar_month", label: "Month", sub: "The whole month at a glance" },
  ];
  return (
    <div
      className="sheet-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet">
        <button className="iconbtn sheetclose" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
        <h2>View</h2>
        <div className="settingslist ownermenu">
          {rows.map((r) => (
            <button
              key={r.v}
              className="setrow"
              onClick={() => {
                onClose();
                onPick(r.v);
              }}
            >
              <span className="setrow-ic"><Icon name={r.icon} size={22} /></span>
              <span className="setrow-txt">
                <span className="t">{r.label}</span>
                <span className="s">{r.sub}</span>
              </span>
              {view === r.v ? (
                <span className="setrow-chev viewsheet-on"><Icon name="check" size={20} /></span>
              ) : (
                <span className="setrow-chev" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The kind filters: a colour-coded checkmark per kind, all on by default.
 *  They replaced the underline tabs the day the colour moved onto the cards:
 *  the chip's swatch is the same colour the class wears, so the row is the
 *  legend and the filter in one. Multi-select; unchecking everything empties
 *  the list honestly rather than snapping back. */
export function KindChecks({
  present,
  on,
  onToggle,
}: {
  present: CalKind[];
  on: Set<CalKind>;
  onToggle: (k: CalKind) => void;
}) {
  if (present.length < 2) return null;
  return (
    <div className="kindchecks" aria-label="Calendar filter">
      {present.map((k) => {
        const checked = on.has(k);
        return (
          <button
            key={k}
            className={`kindcheck kindcheck-${k}${checked ? " on" : ""}`}
            data-kind={k}
            aria-pressed={checked}
            onClick={() => onToggle(k)}
          >
            <span className="kindcheck-box" aria-hidden="true">
              {checked && <Icon name="check" size={13} />}
            </span>
            {KIND_LABEL[k]}
          </button>
        );
      })}
    </div>
  );
}

/** Scrolling up reveals what has been. The list starts at today as ever; a
 *  sentinel above it watches for the top of the page, and each time it comes
 *  into view another slice of past days renders above, with the scroll
 *  position compensated so the screen doesn't jump. Capped so the walk back
 *  ends where the loaded window does. */
export function usePastReveal(maxWeeks: number, step = 2) {
  const [pastWeeks, setPastWeeks] = useState(0);
  const [node, setNode] = useState<HTMLElement | null>(null);
  const prevH = useRef<number | null>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  // The page's scroller differs by shell: the tabs layout scrolls the body,
  // the coach shell scrolls its .stage. Walk up from the sentinel so both
  // get their height read and their position compensated in the right place.
  const scrollerOf = (el: HTMLElement): HTMLElement => {
    let n = el.parentElement;
    while (n) {
      const o = getComputedStyle(n).overflowY;
      if (o === "auto" || o === "scroll") return n;
      n = n.parentElement;
    }
    return (document.scrollingElement as HTMLElement) || document.documentElement;
  };
  useEffect(() => {
    if (!node) return;
    scrollerRef.current = scrollerOf(node);
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setPastWeeks((w) => {
          if (w >= maxWeeks) return w;
          prevH.current = scrollerRef.current?.scrollHeight ?? 0;
          return Math.min(maxWeeks, w + step);
        });
      },
      { rootMargin: "200px 0px 0px 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [node, maxWeeks, step]);
  // Prepending content above the viewport would shove today down the screen;
  // scroll by exactly what was added and the view stays put.
  useLayoutEffect(() => {
    const sc = scrollerRef.current;
    if (prevH.current == null || !sc) return;
    const delta = sc.scrollHeight - prevH.current;
    prevH.current = null;
    if (delta > 0) sc.scrollTop += delta;
  }, [pastWeeks]);
  const sentinel = pastWeeks < maxWeeks ? <div ref={setNode} aria-hidden="true" /> : null;
  return { pastWeeks, sentinel };
}

/** One row of the month: what to draw in a day's cell. */
export type MonthCellItem = { kind: CalKind; name: string; at: number };

/** The month, whole: Monday-led weeks covering the anchor month, a pill per
 *  class in its kind's colour, past days dimmed, today ringed. Days outside
 *  the month render empty rather than borrowing the neighbours' rows. */
export function MonthGrid({
  ym,
  todayIso,
  items,
  onPrev,
  onNext,
  onDay,
}: {
  /** "2026-08" */
  ym: string;
  todayIso: string;
  /** iso -> that day's rows, already filtered and sorted. */
  items: Map<string, MonthCellItem[]>;
  onPrev: () => void;
  onNext: () => void;
  /** A tap on a future (or today's) day with something on it. */
  onDay: (iso: string) => void;
}) {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // days shown before the 1st
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - lead);
  const cells: { iso: string; day: number; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    cells.push({ iso, day: d.getUTCDate(), inMonth: d.getUTCMonth() === m - 1 });
    // Stop once the month has ended at a week boundary.
    if (i >= 27 && (i + 1) % 7 === 0 && d.getUTCMonth() !== m - 1 && d.getUTCDate() >= 7) break;
  }
  const MAX = 3;
  return (
    <div className="monthwrap">
      <div className="monthnav">
        <button className="iconbtn monthnav-b" aria-label="Previous month" onClick={onPrev}>
          <Icon name="chevron_left" size={18} />
        </button>
        <button className="iconbtn monthnav-b" aria-label="Next month" onClick={onNext}>
          <Icon name="chevron_right" size={18} />
        </button>
      </div>
      <div className="monthhead" aria-hidden="true">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="monthgrid">
        {cells.map((c) => {
          const rows = c.inMonth ? (items.get(c.iso) ?? []) : [];
          const past = c.iso < todayIso;
          const today = c.iso === todayIso;
          const tappable = c.inMonth && !past && rows.length > 0;
          return (
            <button
              key={c.iso}
              className={`monthday${c.inMonth ? "" : " out"}${past ? " past" : ""}${today ? " today" : ""}`}
              disabled={!tappable}
              onClick={() => onDay(c.iso)}
            >
              {c.inMonth && <span className="monthday-n">{c.day}</span>}
              {rows.slice(0, MAX).map((r, i) => (
                <span key={i} className={`monthpill ev-${r.kind}`}>
                  {r.name}
                </span>
              ))}
              {rows.length > MAX && <span className="monthmore">+{rows.length - MAX}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
