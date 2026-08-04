"use client";

import Link from "next/link";
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

/** Which views exist so far. Week is the one still to come. */
export type CalView = "list" | "day" | "month";

const VIEW_KEY = "fl-cal-view";

/** The remembered view: a preference, not a filter, so it survives arrival. */
export function loadCalView(): CalView {
  if (typeof window === "undefined") return "list";
  const v = localStorage.getItem(VIEW_KEY);
  return v === "month" || v === "day" ? v : "list";
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
 *  into the past), and Add bottom right, in the brand orange.
 *
 *  Add and Share traded places. Adding is the thing somebody opens this
 *  screen to do, and it was in the top right corner, which is the one part
 *  of a phone a thumb cannot reach; sharing is a thing you do occasionally
 *  and deliberately, so it took the corner instead. The loud colour follows
 *  the primary action rather than staying where it was drawn. */
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
      {/* Share floats where Add used to, in the shape Add used to wear. They
          traded places: adding is one glyph everybody already reads, so it
          costs nothing in the header's cluster, while Share is the act this
          screen exists to end on and it earns the loud pill under a thumb. */}
      <button className={`calshare${lift}`} onClick={onShare}>
        <Icon name="auto_awesome" size={19} />
        Share
      </button>
    </>
  );
}

/**
 * The calendar with nothing on it: the whole screen, and no chrome at all.
 *
 * A month title, a view menu, a filter, a Share and a Today are five controls
 * over an empty list. They are ways of looking at something, and there is
 * nothing to look at; a filter that can only ever hide nothing, and a view
 * switcher between three empty views, teach a first-time user that this
 * screen is complicated before it has done anything for them. So the screens
 * that draw this draw only this: the figure, one line of what the screen is
 * for, and the two things there are to do about it.
 *
 * Both calendars render it, which is why it lives here with the rest of the
 * chrome. What differs is a coach's job and a member's, so the words and
 * which button leads are the caller's: a coach with an empty week has a
 * public page that does not work yet, and telling them to go browsing first
 * would be telling them the wrong thing.
 */
export function CalEmpty({
  body,
  addLabel,
  onAdd,
  /** Offer the way to find somebody to follow, under the add. A member gets
   *  it, because a calendar with nothing on it is usually a follow list with
   *  nothing on it; a coach does not, because the one thing a coach with an
   *  empty week needs is their first class on it, and a second button here
   *  sends them browsing instead of publishing. */
  findCoach = false,
}: {
  body: string;
  addLabel: string;
  onAdd: () => void;
  findCoach?: boolean;
}) {
  return (
    <div className="empty-block emptyart-block calempty">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="emptyart"
        src="/illustrations/following-empty.png"
        alt=""
        width={356}
        height={600}
      />
      <h2>Your week is wide open</h2>
      <p>{body}</p>
      {/* The one that leads reads first as well as loudest. A filled button
          under an outline one says the second thing is the real thing, which
          is a sentence read backwards. Putting something on the calendar is
          what this screen is for, so it leads either way. */}
      <div className="calempty-cta">
        <button className="btn si" onClick={onAdd}>
          {addLabel}
        </button>
        {findCoach && (
          <Link className="btn ghost" href="/discover">
            Find a coach to follow
          </Link>
        )}
      </div>
    </div>
  );
}

/** Add, in the header's cluster: the same circle as the view and filter
 *  buttons beside it, filled in brand orange, and the plus alone. A plus is
 *  the one glyph nobody has to be taught, so it needs no word; the colour is
 *  what keeps the primary action loud at a third of the size. */
export function CalAdd({ onAdd }: { onAdd: () => void }) {
  return (
    <button className="caladd" aria-label="Add" onClick={onAdd}>
      <Icon name="add" size={20} strokeWidth={2.6} />
    </button>
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

/** Straight to the top, both scrollers: the tabs layout scrolls the body
 *  and the coach shell scrolls its .stage. The Day view wants this on
 *  entry, because the List leaves its scroller deep in the compensated
 *  past and a shorter view inherits that offset as a random landing. */
export function scrollCalTop() {
  const stage = document.querySelector<HTMLElement>(".stage");
  if (stage) stage.scrollTop = 0;
  const doc = document.scrollingElement;
  if (doc) doc.scrollTop = 0;
}

/** The calendar's header as one sticky block: the month row and the kind
 *  checkmarks pin under the app header, with the divider underneath them,
 *  so the list scrolls beneath the chrome. The offset is the brandbar's
 *  measured height, because the brandbar is itself sticky and the two must
 *  not overlap. */
/**
 * Where a sticky day band pins: the app header, plus whatever chrome is
 * pinned under it on this screen.
 *
 * One writer on purpose. Every list that bands its days needs this number and
 * none of them can work it out alone, and two screens computing it their own
 * way is how they end up disagreeing by a few pixels that nobody can explain.
 * Following passes nothing (the coach rail scrolls away, so only the header is
 * above the list); a calendar passes its own chrome block.
 */
export function publishBandTop(extra?: HTMLElement | null): number {
  const bb = document.querySelector<HTMLElement>(".brandbar");
  const head = bb?.offsetHeight ?? 0;
  document.documentElement.style.setProperty(
    "--dayband-top",
    `${head + (extra?.offsetHeight ?? 0)}px`,
  );
  return head;
}

/** Keep it current: the header and the chrome both change height with the
 *  view, so this is watched rather than read once. */
export function useBandTop(ref?: { current: HTMLElement | null }) {
  useEffect(() => {
    const el = ref?.current ?? null;
    const bb = document.querySelector<HTMLElement>(".brandbar");
    const apply = () => {
      const head = publishBandTop(el);
      if (el) el.style.top = `${head}px`;
    };
    apply();
    const ro = new ResizeObserver(apply);
    if (el) ro.observe(el);
    if (bb) ro.observe(bb);
    return () => ro.disconnect();
  }, [ref]);
}

export function CalSticky({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useBandTop(ref);
  return (
    <div ref={ref} className="calsticky">
      {children}
    </div>
  );
}

const VIEW_ICON: Record<CalView, string> = {
  list: "list",
  day: "calendar_today",
  month: "calendar_month",
};

/** The title row: the month leading at the gutter, and the right cluster of
 *  three: the current view's own glyph (tap for the view sheet), the
 *  filters glyph (tap for the kind sheet), and whatever the caller passes
 *  as children (the share circle), so each screen keeps its own handler. The hamburger
 *  is gone: the view button says what you're looking at, not that a menu
 *  exists. */
export function CalHead({
  label,
  view,
  onMenu,
  onFilter,
  onTitle,
  pickerOpen = false,
  children,
}: {
  label: string;
  view: CalView;
  onMenu: () => void;
  onFilter: () => void;
  /** The month is a door too: tapping it opens the mini calendar, the way
   *  Google Calendar's title does. */
  onTitle?: () => void;
  pickerOpen?: boolean;
  children: ReactNode;
}) {
  const title = <h2 className="calhead">{label}</h2>;
  return (
    <div className="calhead-row">
      {onTitle ? (
        <button className="calhead-door" aria-expanded={pickerOpen} onClick={onTitle}>
          {title}
        </button>
      ) : (
        title
      )}
      <span className="calhead-spacer" />
      <button className="calmenu" aria-label="Calendar views" onClick={onMenu}>
        <Icon name={VIEW_ICON[view]} size={21} />
      </button>
      <button className="calfilter" aria-label="Filters" onClick={onFilter}>
        <Icon name="tune" size={21} />
      </button>
      {children}
    </div>
  );
}

/** The mini calendar behind the month: one month as a compact grid,
 *  chevrons walking months, a dot under a day that holds anything, and a
 *  tap handing the date back to whatever view is open. It drops from the
 *  sticky header the way Google Calendar's does, with a click-away scrim
 *  over the page beneath. The title is the whole door; it wore a chevron
 *  for a day and the glyph was saying what the tap already says. */
export function MiniCalPicker({
  ym: ymStart,
  dayIso,
  todayIso,
  hasDot,
  onPick,
  onClose,
}: {
  ym: string;
  /** The date to show picked (the Day view's selection; today elsewhere). */
  dayIso: string;
  todayIso: string;
  hasDot?: (iso: string) => boolean;
  onPick: (iso: string) => void;
  onClose: () => void;
}) {
  const [ym, setYm] = useState(ymStart);
  const [y, m] = ym.split("-").map(Number);
  const shift = (by: number) => {
    const d = new Date(Date.UTC(y, m - 1 + by, 1));
    setYm(d.toISOString().slice(0, 7));
  };
  // Sunday-led, like the Month grid: the US week people read on paper.
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysIn }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`),
  ];
  return (
    <>
      <div className="calpicker-scrim" onClick={onClose} aria-hidden="true" />
      <div className="calpicker">
        <div className="calpicker-head">
          <span className="calpicker-title">{monthLabel(ym, todayIso)}</span>
          <button className="calpicker-arrow" aria-label="Previous month" onClick={() => shift(-1)}>
            <Icon name="chevron_left" size={18} />
          </button>
          <button className="calpicker-arrow" aria-label="Next month" onClick={() => shift(1)}>
            <Icon name="chevron_right" size={18} />
          </button>
        </div>
        <div className="calpicker-grid">
          {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => (
            <span key={i} className="calpicker-wd">
              {w}
            </span>
          ))}
          {cells.map((iso, i) =>
            iso ? (
              <button
                key={iso}
                className={`calpicker-d${iso === dayIso ? " sel" : ""}${iso === todayIso ? " today" : ""}`}
                onClick={() => {
                  onClose();
                  onPick(iso);
                }}
              >
                <span className="n">{iso.slice(8).replace(/^0/, "")}</span>
                {hasDot?.(iso) ? <span className="calpicker-dot" aria-hidden="true" /> : null}
              </button>
            ) : (
              <span key={`b${i}`} />
            ),
          )}
        </div>
      </div>
    </>
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
    { v: "day", icon: "calendar_today", label: "Day", sub: "One day, hour by hour" },
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

/** The kind filters, behind the header's filter glyph now: a bottom sheet
 *  of switches, one per kind the calendar holds, each row wearing its
 *  colour as a dot. Everything is on by default, and off on arrival
 *  resets: a filter is a way of looking, not a fact worth storing. */
export function KindFilterSheet({
  present,
  on,
  onToggle,
  onClose,
}: {
  present: CalKind[];
  on: (k: CalKind) => boolean;
  onToggle: (k: CalKind) => void;
  onClose: () => void;
}) {
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
        <h2>Show on your calendar</h2>
        <div className="settingslist ownermenu">
          {present.map((k) => {
            const checked = on(k);
            return (
              <button
                key={k}
                className="setrow"
                data-kind={k}
                aria-pressed={checked}
                onClick={() => onToggle(k)}
              >
                <span className="setrow-ic">
                  <span className={`kindfilter-dot kindfilter-${k}`} aria-hidden="true" />
                </span>
                <span className="setrow-txt">
                  <span className="t">{KIND_LABEL[k]}</span>
                </span>
                <span className={`switch${checked ? " on" : ""}`} aria-hidden="true">
                  <span className="switch-knob" />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** The Day view's week strip, pinned in the sticky chrome: the selected
 *  day's week, Monday-led, a chevron either side to walk the weeks. The
 *  selected day fills orange; today rings itself so it stays findable. */
export function DayStrip({
  dayIso,
  todayIso,
  onPick,
}: {
  dayIso: string;
  todayIso: string;
  onPick: (iso: string) => void;
}) {
  const d = new Date(`${dayIso}T00:00:00Z`);
  // Sunday-led, the same week the Month grid draws.
  const dow = d.getUTCDay();
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() - dow);
  const days: { iso: string; n: number; wd: string }[] = [];
  const WD = ["S", "M", "T", "W", "T", "F", "S"];
  for (let i = 0; i < 7; i++) {
    const x = new Date(mon);
    x.setUTCDate(mon.getUTCDate() + i);
    days.push({ iso: x.toISOString().slice(0, 10), n: x.getUTCDate(), wd: WD[i] });
  }
  const shift = (delta: number) => {
    const x = new Date(`${dayIso}T00:00:00Z`);
    x.setUTCDate(x.getUTCDate() + delta);
    onPick(x.toISOString().slice(0, 10));
  };
  return (
    <div className="daystrip" aria-label="Pick a day">
      <button className="daystrip-arrow" aria-label="Previous week" onClick={() => shift(-7)}>
        <Icon name="chevron_left" size={18} />
      </button>
      {days.map((x) => (
        <button
          key={x.iso}
          className={`daystrip-day${x.iso === dayIso ? " sel" : ""}${x.iso === todayIso ? " today" : ""}`}
          aria-pressed={x.iso === dayIso}
          onClick={() => onPick(x.iso)}
        >
          <span className="daystrip-wd">{x.wd}</span>
          <span className="daystrip-n">{x.n}</span>
        </button>
      ))}
      <button className="daystrip-arrow" aria-label="Next week" onClick={() => shift(7)}>
        <Icon name="chevron_right" size={18} />
      </button>
    </div>
  );
}

/** One event on the day's hour grid. Either wire `onTap`, or set the data
 *  attributes and let a wrapping ClassOpener catch the tap the way it does
 *  on the lists. */
export type DayGridEvent = {
  key: string;
  kind: CalKind;
  name: string;
  /** Minutes from midnight. */
  at: number;
  durationMin: number;
  where?: string | null;
  onTap?: () => void;
  classId?: string;
  iso?: string;
  base?: string;
};

const HOUR_PX = 60;

/** The day, hour by hour: rules per hour, the events laid onto them by
 *  when they are, in the kind's wash. Overlaps split the width into lanes
 *  rather than stacking. The grid starts an hour before the first thing
 *  and ends an hour after the last, bounded to a sane training day. */
export function DayGrid({
  dayIso,
  events,
}: {
  dayIso: string;
  events: DayGridEvent[];
}) {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const first = sorted.length ? Math.min(...sorted.map((e) => e.at)) : 8 * 60;
  const last = sorted.length ? Math.max(...sorted.map((e) => e.at + e.durationMin)) : 18 * 60;
  const startH = Math.max(0, Math.min(Math.floor(first / 60) - 1, 7));
  const endH = Math.min(24, Math.max(Math.ceil(last / 60) + 1, 20));
  const hours: number[] = [];
  for (let h = startH; h <= endH; h++) hours.push(h);
  // Lanes: overlapping events sit side by side. Greedy by start time.
  const lanes: DayGridEvent[][] = [];
  const laneOf = new Map<string, { lane: number; lanes: number }>();
  const clusters: DayGridEvent[][] = [];
  let cluster: DayGridEvent[] = [];
  let clusterEnd = -1;
  for (const e of sorted) {
    if (cluster.length && e.at >= clusterEnd) {
      clusters.push(cluster);
      cluster = [];
      clusterEnd = -1;
    }
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, e.at + e.durationMin);
  }
  if (cluster.length) clusters.push(cluster);
  for (const c of clusters) {
    lanes.length = 0;
    for (const e of c) {
      let lane = lanes.findIndex((l) => l[l.length - 1].at + l[l.length - 1].durationMin <= e.at);
      if (lane === -1) {
        lanes.push([]);
        lane = lanes.length - 1;
      }
      lanes[lane].push(e);
      laneOf.set(e.key, { lane, lanes: 0 });
    }
    for (const e of c) laneOf.get(e.key)!.lanes = lanes.length;
  }
  const fmtH = (h: number) =>
    h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "Noon" : h === 24 ? "12 AM" : `${h - 12} PM`;
  const fmtT = (min: number) => {
    const h = Math.floor(min / 60) % 24;
    const m = min % 60;
    const hh = h % 12 === 0 ? 12 : h % 12;
    return `${hh}:${String(m).padStart(2, "0")}${h < 12 ? "a" : "p"}`;
  };
  return (
    <div className="daygrid" data-day={dayIso}>
      {hours.map((h) => (
        <div key={h} className="daygrid-hour" style={{ top: (h - startH) * HOUR_PX }}>
          <span className="daygrid-hlabel">{fmtH(h)}</span>
          <span className="daygrid-hrule" />
        </div>
      ))}
      <div className="daygrid-body" style={{ height: (endH - startH) * HOUR_PX }}>
        {sorted.map((e) => {
          const pos = laneOf.get(e.key)!;
          const top = ((e.at - startH * 60) / 60) * HOUR_PX;
          const height = Math.max((e.durationMin / 60) * HOUR_PX, 30);
          const width = 100 / pos.lanes;
          return (
            <button
              key={e.key}
              className={`daygrid-ev ev-${e.kind}`}
              style={{
                top,
                height,
                left: `${pos.lane * width}%`,
                width: `calc(${width}% - 4px)`,
              }}
              data-cid={e.classId}
              data-d={e.iso}
              data-base={e.base}
              onClick={e.onTap}
            >
              <span className="daygrid-evnm">{e.name}</span>
              <span className="daygrid-evt">
                {fmtT(e.at)} to {fmtT(e.at + e.durationMin)}
                {e.where ? ` · ${e.where}` : ""}
              </span>
            </button>
          );
        })}
      </div>
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
      {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
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
  const lead = first.getUTCDay(); // days shown before the 1st, Sunday-led
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
