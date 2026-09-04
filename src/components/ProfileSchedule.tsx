"use client";

import { useMemo, useState } from "react";
import { CalendarList, type WeekDayRows } from "@/components/WeekView";
import { ScheduleMore } from "@/components/ScheduleMore";

export function ProfileSchedule({ days }: { days: WeekDayRows[] }) {
  const studios = useMemo(() => {
    const found = new Map<string, string>();
    for (const day of days) for (const row of day.rows) if (row.studio) found.set(row.studio.id, row.studio.name);
    return [...found].map(([id, name]) => ({ id, name }));
  }, [days]);
  const [studioId, setStudioId] = useState<string | null>(null);

  const filtered = useMemo(() => days
    .map((day) => ({ ...day, rows: studioId ? day.rows.filter((row) => row.studio?.id === studioId) : day.rows }))
    .filter((day) => day.rows.length), [days, studioId]);

  let remaining = 8;
  const preview: WeekDayRows[] = [];
  const later: WeekDayRows[] = [];
  for (const day of filtered) {
    const first = day.rows.slice(0, remaining);
    const rest = day.rows.slice(remaining);
    if (first.length) preview.push({ ...day, rows: first });
    if (rest.length) later.push({ ...day, rows: rest });
    remaining = Math.max(0, remaining - first.length);
    if (!remaining && !rest.length && day.rows.length) {
      const at = filtered.indexOf(day);
      later.push(...filtered.slice(at + 1));
      break;
    }
  }

  return (
    <>
      {studios.length > 1 && (
        <div className="profile-schedule-filters" aria-label="Filter schedule by studio">
          <button type="button" className={studioId === null ? "on" : ""} aria-pressed={studioId === null} onClick={() => setStudioId(null)}>All</button>
          {studios.map((studio) => (
            <button key={studio.id} type="button" className={studioId === studio.id ? "on" : ""} aria-pressed={studioId === studio.id} onClick={() => setStudioId(studio.id)}>{studio.name}</button>
          ))}
        </div>
      )}
      <CalendarList days={preview} className="profile-calendar-list profile-person-calendar-list" />
      {later.length > 0 && <ScheduleMore key={studioId ?? "all"} label="See more schedule" chunks={[<CalendarList key="more-schedule" days={later} className="profile-calendar-list profile-person-calendar-list" />]} />}
    </>
  );
}
