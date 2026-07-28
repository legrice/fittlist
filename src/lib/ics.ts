// iCalendar helpers shared by the per-coach feed and the single-class
// "Add to calendar" download. Times are emitted as "floating" (no timezone)
// so a 6:00a class shows as 6:00 in whoever's viewing it, which is what a
// coach wants for their local classes.

export const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export const icsEsc = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// RFC 5545 asks lines be folded at 75 octets; fold conservatively at 73 chars.
export function icsFold(line: string): string {
  const out: string[] = [];
  let s = line;
  while (s.length > 73) {
    out.push(s.slice(0, 73));
    s = " " + s.slice(73);
  }
  out.push(s);
  return out.join("\r\n");
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-07-20" + "06:00" -> "20260720T060000" (floating local time) */
export function floatingStart(dateStr: string, hhmm: string): string {
  return `${dateStr.replace(/-/g, "")}T${hhmm.replace(/:/g, "")}00`;
}

/** start + duration -> floating end stamp, rolling past midnight if needed */
export function floatingEnd(dateStr: string, hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCHours(h, m + mins, 0, 0);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`
  );
}

/** The weekly rule for a standing class, ending on `endsOn` when it has one.
 *  UNTIL is exclusive of nothing — it's inclusive — and floating dates want a
 *  date-time in UTC, so the day is stamped at 23:59:59Z to cover it fully. */
export function weeklyRule(dayOfWeek: number, endsOn?: string | null): string {
  const base = `FREQ=WEEKLY;BYDAY=${BYDAY[dayOfWeek]}`;
  if (!endsOn) return `RRULE:${base}`;
  return `RRULE:${base};UNTIL=${endsOn.replace(/-/g, "")}T235959Z`;
}

/** The full recurrence for a standing class: the weekly rule, plus an EXDATE
 *  for every single day cancelled out of it. Floating, to match DTSTART — an
 *  EXDATE only cancels an occurrence when its value form matches. Returned as
 *  lines because Google Calendar's `recurrence` is a list of them too. */
export function recurrenceLines(
  dayOfWeek: number,
  endsOn: string | null | undefined,
  skipDates: string[] | null | undefined,
  startTime: string,
): string[] {
  const out = [weeklyRule(dayOfWeek, endsOn)];
  if (skipDates?.length) {
    out.push(`EXDATE:${skipDates.map((d) => floatingStart(d, startTime)).join(",")}`);
  }
  return out;
}
