import {
  DEFAULT_TIME_ZONE,
  normalizeTimeZone,
  timeZoneAbbreviation,
  utcCalendarStamp,
  utcOffsetMinutes,
} from "@/lib/timezone";

// iCalendar helpers shared by the per-coach feed and the single-class
// "Add to calendar" download. Wall-clock values always travel with their
// IANA timezone so importing a 6:00 class does not silently turn it into 6:00
// in the viewer's current zone.

export const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export const icsEsc = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// RFC 5545 folds at 75 UTF-8 octets, not JavaScript characters. Continuation
// lines spend their first octet on a space.
export function icsFold(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const character of line) {
    const width = Buffer.byteLength(character, "utf8");
    if (current && bytes + width > limit) {
      out.push(current);
      current = ` ${character}`;
      bytes = 1 + width;
      limit = 75;
    } else {
      current += character;
      bytes += width;
    }
  }
  out.push(current);
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

/** A timezone-qualified DTSTART/DTEND line for RFC 5545 output. */
export function zonedDateLine(
  property: "DTSTART" | "DTEND" | "EXDATE",
  dateStr: string,
  hhmm: string,
  timeZone = DEFAULT_TIME_ZONE,
): string {
  return `${property};TZID=${normalizeTimeZone(timeZone)}:${floatingStart(dateStr, hhmm)}`;
}

export function zonedEndLine(
  dateStr: string,
  hhmm: string,
  mins: number,
  timeZone = DEFAULT_TIME_ZONE,
): string {
  return `DTEND;TZID=${normalizeTimeZone(timeZone)}:${floatingEnd(dateStr, hhmm, mins)}`;
}

/** The weekly rule for a standing class, ending on `endsOn` when it has one.
 *  UNTIL is exclusive of nothing — it's inclusive — and floating dates want a
 *  date-time in UTC, so the day is stamped at 23:59:59Z to cover it fully. */
export function weeklyRule(
  dayOfWeek: number,
  endsOn?: string | null,
  timeZone = DEFAULT_TIME_ZONE,
): string {
  const base = `FREQ=WEEKLY;BYDAY=${BYDAY[dayOfWeek]}`;
  if (!endsOn) return `RRULE:${base}`;
  return `RRULE:${base};UNTIL=${utcCalendarStamp(endsOn, "23:59", timeZone, 59)}`;
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
  timeZone = DEFAULT_TIME_ZONE,
): string[] {
  const zone = normalizeTimeZone(timeZone);
  const out = [weeklyRule(dayOfWeek, endsOn, zone)];
  if (skipDates?.length) {
    out.push(`EXDATE;TZID=${zone}:${skipDates.map((d) => floatingStart(d, startTime)).join(",")}`);
  }
  return out;
}

const vTimeZoneCache = new Map<string, string[]>();

const offsetStamp = (minutes: number) => {
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return `${sign}${pad(Math.floor(absolute / 60))}${pad(absolute % 60)}`;
};

const localTransitionStamp = (instantMs: number, previousOffset: number) => {
  const local = new Date(instantMs + previousOffset * 60_000);
  return (
    `${local.getUTCFullYear()}${pad(local.getUTCMonth() + 1)}${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}${pad(local.getUTCMinutes())}${pad(local.getUTCSeconds())}`
  );
};

/** RFC 5545 requires every local TZID in a calendar object to have a matching
 * VTIMEZONE. Intl supplies the platform's IANA transition data; explicit
 * observances avoid hard-coding US-only DST rules and also cover fixed zones. */
export function vTimeZoneLines(timeZone: string): string[] {
  const zone = normalizeTimeZone(timeZone);
  const cached = vTimeZoneCache.get(zone);
  if (cached) return [...cached];

  const currentYear = new Date().getUTCFullYear();
  const start = Date.UTC(currentYear - 5, 0, 1);
  const end = Date.UTC(currentYear + 51, 0, 1);
  const week = 7 * 864e5;
  const transitions: Array<{ at: number; from: number; to: number }> = [];
  let previousAt = start;
  let previousOffset = utcOffsetMinutes(new Date(start), zone);

  for (let probe = start + week; probe <= end; probe += week) {
    const probeOffset = utcOffsetMinutes(new Date(probe), zone);
    if (probeOffset !== previousOffset) {
      let lowMinute = Math.floor(previousAt / 60_000);
      let highMinute = Math.ceil(probe / 60_000);
      while (highMinute - lowMinute > 1) {
        const middleMinute = Math.floor((lowMinute + highMinute) / 2);
        if (utcOffsetMinutes(new Date(middleMinute * 60_000), zone) === previousOffset)
          lowMinute = middleMinute;
        else highMinute = middleMinute;
      }
      const at = highMinute * 60_000;
      const to = utcOffsetMinutes(new Date(at), zone);
      transitions.push({ at, from: previousOffset, to });
      previousOffset = to;
    }
    previousAt = probe;
  }

  const initialOffset = utcOffsetMinutes(new Date(start), zone);
  const lines = [
    "BEGIN:VTIMEZONE",
    icsFold(`TZID:${zone}`),
    icsFold(`X-LIC-LOCATION:${zone}`),
    "BEGIN:STANDARD",
    `${"DTSTART"}:${currentYear - 5}0101T000000`,
    `TZOFFSETFROM:${offsetStamp(initialOffset)}`,
    `TZOFFSETTO:${offsetStamp(initialOffset)}`,
    icsFold(`TZNAME:${icsEsc(timeZoneAbbreviation(zone, new Date(start)))}`),
    "END:STANDARD",
  ];
  for (const transition of transitions) {
    lines.push(
      transition.to > transition.from ? "BEGIN:DAYLIGHT" : "BEGIN:STANDARD",
      `DTSTART:${localTransitionStamp(transition.at, transition.from)}`,
      `TZOFFSETFROM:${offsetStamp(transition.from)}`,
      `TZOFFSETTO:${offsetStamp(transition.to)}`,
      icsFold(`TZNAME:${icsEsc(timeZoneAbbreviation(zone, new Date(transition.at + 60_000)))}`),
      transition.to > transition.from ? "END:DAYLIGHT" : "END:STANDARD",
    );
  }
  lines.push("END:VTIMEZONE");
  vTimeZoneCache.set(zone, lines);
  return [...lines];
}

export function calendarTimeZoneLines(timeZones: Iterable<string>): string[] {
  const lines: string[] = [];
  for (const zone of new Set([...timeZones].map((value) => normalizeTimeZone(value)))) {
    lines.push(...vTimeZoneLines(zone));
  }
  return lines;
}
