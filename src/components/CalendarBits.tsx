"use client";

import { useEffect, useState, type ReactNode } from "react";
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

/** The two persistent doors under every calendar view: Today on the left
 *  (back to now, in the list), the plus on the right (add, wherever you
 *  are). Google keeps them on screen for the same reason: the two things a
 *  calendar is for should never be a scroll away. */
export function CalBottomBar({
  raised = true,
  onToday,
  onAdd,
}: {
  /** Sitting above a tab bar, or on a screen without one. */
  raised?: boolean;
  onToday: () => void;
  onAdd: () => void;
}) {
  const lift = raised ? "" : " calfabs-low";
  return (
    <>
      <button className={`todayfab${lift}`} onClick={onToday}>
        Today
      </button>
      <button className={`calfab-add${lift}`} aria-label="Add" onClick={onAdd}>
        <Icon name="add" size={26} />
      </button>
    </>
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
