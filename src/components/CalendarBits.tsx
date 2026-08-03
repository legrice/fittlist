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

/** The two persistent doors under every calendar view: Today bottom left
 *  (back to now, in the list, which matters more now that the list scrolls
 *  into the past), Share bottom right (handing your week on is the habit
 *  the whole app leans on). The plus lives up in the header's capsule. */
export function CalBottomBar({
  raised = true,
  onToday,
  onShare,
}: {
  /** Sitting above a tab bar, or on a screen without one. */
  raised?: boolean;
  onToday: () => void;
  onShare: () => void;
}) {
  const lift = raised ? "" : " calfabs-low";
  return (
    <>
      <button className={`todayfab${lift}`} onClick={onToday}>
        Today
      </button>
      <button className={`sharefab${lift}`} onClick={onShare}>
        {/* The sparkle, in the brand orange: the pill's one moment of colour. */}
        <span className="sharefab-ic" aria-hidden="true">
          <Icon name="auto_awesome" size={17} />
        </span>
        Share
      </button>
    </>
  );
}

/** Back to now: the first day that isn't scrolled-back past. Scrolling the
 *  window alone missed on the coach shell, which scrolls its .stage. */
export function scrollToToday() {
  const el = document.querySelector<HTMLElement>(".ps-daygroup:not(.ps-pastday)");
  if (el) {
    el.scrollIntoView({ block: "start", behavior: "smooth" });
    return;
  }
  document.querySelector(".stage")?.scrollTo({ top: 0, behavior: "smooth" });
  window.scrollTo({ top: 0, behavior: "smooth" });
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

/** The title row: the view menu as a bare glyph leading the month, and Add
 *  as the one orange circle across from them (the caller passes the Add
 *  button as children, so each screen keeps its own handler). The menu wore
 *  a circle, then a shared capsule with Add; both read as more chrome than
 *  two small controls earn. */
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
      <button className="calmenu" aria-label="Calendar views" onClick={onMenu}>
        <Icon name="menu" size={20} />
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

/** The kind filters: All leading, then a pill per kind, the same All-led
 *  rail Discover wears. All is on by default; picking a kind fills the pill
 *  with the colour its rows wear, so the rail is the legend and the filter
 *  in one. Multi-select; any pick takes All off, and clearing the last pick
 *  hands it back. */
export function KindChecks({
  present,
  picked,
  onToggle,
  onAll,
}: {
  present: CalKind[];
  /** The kinds narrowed to. Empty means All: everything shows. */
  picked: Set<CalKind>;
  onToggle: (k: CalKind) => void;
  onAll: () => void;
}) {
  if (present.length < 2) return null;
  return (
    <div className="kindchecks" aria-label="Calendar filter">
      <button
        className={`kindcheck kindcheck-all${picked.size === 0 ? " on" : ""}`}
        data-kind="all"
        aria-pressed={picked.size === 0}
        onClick={onAll}
      >
        All
      </button>
      {present.map((k) => {
        const on = picked.has(k);
        return (
          <button
            key={k}
            className={`kindcheck kindcheck-${k}${on ? " on" : ""}`}
            data-kind={k}
            aria-pressed={on}
            onClick={() => onToggle(k)}
          >
            {/* The legend: the kind's colour as a dot at rest, inverting to
                white when the pill fills with that colour. */}
            <span className="kindcheck-dot" aria-hidden="true" />
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

/** The List's answer to the month scroll's title-following: watch the day
 *  groups, and report the month of whichever crosses the band under the
 *  header, so the title stays true while the list scrolls across a month
 *  boundary in either direction. `dep` re-attaches the observer when the
 *  rendered days change (more weeks, more past). */
export function useListMonthSpy(
  active: boolean,
  onYm: (ym: string) => void,
  dep: string,
) {
  useEffect(() => {
    if (!active) return;
    const els = document.querySelectorAll<HTMLElement>('.ps-daygroup[id^="day-"]');
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.target instanceof HTMLElement)
            onYm(e.target.id.slice(4, 11));
        }
      },
      { rootMargin: "-25% 0px -70% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [active, onYm, dep]);
}

/** One row of the month: what to draw in a day's cell. */
export type MonthCellItem = { kind: CalKind; name: string; at: number };

/** How far the month scroll reaches: back to where the list's past window
 *  ends, forward a year. */
export const MONTHS_BACK = 2;
export const MONTHS_AHEAD = 12;

/** The weekday initials, pinned in the sticky chrome while the months
 *  scroll beneath, the way Apple pins them. */
export function MonthHeadRow() {
  return (
    <div className="monthhead" aria-hidden="true">
      {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
        <span key={i}>{d}</span>
      ))}
    </div>
  );
}

/** One month's grid: Monday-led weeks, a pill per class in its kind's
 *  colour, past days dimmed, today filled. Days outside the month render
 *  empty rather than borrowing the neighbours' rows. */
function MonthBlock({
  ym,
  todayIso,
  items,
  onDay,
}: {
  ym: string;
  todayIso: string;
  /** iso -> that day's rows. May span every month; only this one is read. */
  items: Map<string, MonthCellItem[]>;
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
    <div id={`month-${ym}`} data-ym={ym} className="monthblock">
      <h3 className="monthblock-h">{monthLabel(ym, todayIso)}</h3>
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

/** The months as one continuous scroll, the way Apple draws them: this
 *  month first in view, the recent past above it, a year ahead below, no
 *  chevrons. The sticky header's title follows whichever month is under
 *  it, reported through onMonthInView. */
export function MonthScroll({
  todayIso,
  items,
  onDay,
  onMonthInView,
}: {
  todayIso: string;
  /** iso -> that day's rows, spanning the whole range, filtered and sorted. */
  items: Map<string, MonthCellItem[]>;
  onDay: (iso: string) => void;
  onMonthInView: (ym: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const thisYm = todayIso.slice(0, 7);
  const [y0, m0] = thisYm.split("-").map(Number);
  const yms: string[] = [];
  for (let i = -MONTHS_BACK; i <= MONTHS_AHEAD; i++) {
    const d = new Date(Date.UTC(y0, m0 - 1 + i, 1));
    yms.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  // Land on the current month, instantly, once: the past sits above the
  // fold the way the list's past does.
  useLayoutEffect(() => {
    document.getElementById(`month-${thisYm}`)?.scrollIntoView({ block: "start" });
  }, [thisYm]);
  // The title follows the month crossing the band under the header.
  useEffect(() => {
    const blocks = wrapRef.current?.querySelectorAll<HTMLElement>("[data-ym]");
    if (!blocks?.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.target instanceof HTMLElement && e.target.dataset.ym)
            onMonthInView(e.target.dataset.ym);
        }
      },
      { rootMargin: "-30% 0px -65% 0px" },
    );
    blocks.forEach((b) => io.observe(b));
    return () => io.disconnect();
  }, [onMonthInView]);
  return (
    <div ref={wrapRef} className="monthscroll">
      {yms.map((ym) => (
        <MonthBlock key={ym} ym={ym} todayIso={todayIso} items={items} onDay={onDay} />
      ))}
    </div>
  );
}
