"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

export function CalendarMiniMonth({ todayIso, dates, onDay, onMonthChange }: {
  todayIso: string;
  dates: ReadonlyMap<string, readonly unknown[]>;
  onDay: (iso: string) => void;
  onMonthChange?: (month: string) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [year, month] = todayIso.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + offset, 1));
  const label = first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const monthKey = first.toISOString().slice(0, 7);
  useEffect(() => { onMonthChange?.(monthKey); }, [monthKey, onMonthChange]);
  const leading = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return <section className="calendar-mini-month" aria-label="Jump to a date">
    <div className="calendar-mini-heading"><h2 aria-live="polite">{label}</h2><button type="button" aria-label="Previous month" disabled={offset === 0} onClick={() => setOffset(n => n - 1)}><Icon name="chevron_left" size={20}/></button><button type="button" aria-label="Next month" disabled={offset === 12} onClick={() => setOffset(n => n + 1)}><Icon name="chevron_right" size={20}/></button></div>
    <div className="calendar-mini-grid">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <span className="calendar-mini-weekday" key={day}>{day.slice(0, 1)}</span>)}
      {Array.from({ length: leading }, (_, i) => <span key={`empty-${i}`} />)}
      {Array.from({ length: count }, (_, i) => {
        const iso = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), i + 1)).toISOString().slice(0, 10);
        const total = dates.get(iso)?.length ?? 0;
        return <button key={iso} type="button" className={`${total ? "has-classes" : ""}${selected === iso ? " selected" : ""}`} disabled={iso < todayIso || !total} aria-current={iso === todayIso ? "date" : undefined} aria-pressed={selected === iso} aria-label={`${new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}, ${total} ${total === 1 ? "class" : "classes"}`} onClick={() => { setSelected(iso); onDay(iso); }}>{i + 1}{total > 0 && <i aria-hidden="true" />}</button>;
      })}
    </div>
    <p>Highlighted dates have classes in this view.</p>
  </section>;
}
