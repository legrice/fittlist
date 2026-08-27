/**
 * IANA timezone helpers shared by schedule validation and calendar exports.
 *
 * Class times are deliberately stored as local wall-clock values ("06:30").
 * A timezone is therefore part of the value: without it the same row means a
 * different instant to Google, Apple, reminders, and the class page.
 */

export const DEFAULT_TIME_ZONE =
  process.env.NEXT_PUBLIC_APP_TZ || "America/New_York";

const validZones = new Map<string, boolean>();
const zonedFormatters = new Map<string, Intl.DateTimeFormat>();

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 80) return false;
  const cached = validZones.get(value);
  if (cached !== undefined) return cached;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    validZones.set(value, true);
    return true;
  } catch {
    validZones.set(value, false);
    return false;
  }
}

export function normalizeTimeZone(
  value: unknown,
  fallback = DEFAULT_TIME_ZONE,
): string {
  return isValidTimeZone(value) ? value : isValidTimeZone(fallback) ? fallback : "UTC";
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function zonedParts(at: Date, timeZone: string): ZonedParts {
  const zone = normalizeTimeZone(timeZone);
  let formatter = zonedFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    zonedFormatters.set(zone, formatter);
  }
  const parts = formatter.formatToParts(at);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour") % 24,
    minute: read("minute"),
    second: read("second"),
  };
}

/** UTC offset, in minutes east of UTC, at one exact instant. */
export function utcOffsetMinutes(at: Date, timeZone: string): number {
  const p = zonedParts(at, timeZone);
  const renderedAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const instantToSecond = Math.floor(at.getTime() / 1000) * 1000;
  return Math.round((renderedAsUtc - instantToSecond) / 60_000);
}

const pad = (value: number) => String(value).padStart(2, "0");

export function isoDateInTimeZone(at = new Date(), timeZone = DEFAULT_TIME_ZONE): string {
  const p = zonedParts(at, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function minutesInTimeZone(at = new Date(), timeZone = DEFAULT_TIME_ZONE): number {
  const p = zonedParts(at, timeZone);
  return p.hour * 60 + p.minute;
}

/**
 * Resolve a local wall-clock value in an IANA zone to its UTC instant.
 * Re-applying the offset handles both halves of a DST boundary without a
 * dependency on the server's own timezone.
 */
export function zonedDateTimeToDate(
  iso: string,
  hhmm: string,
  timeZone: string,
  seconds = 0,
): Date {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!dateMatch || !timeMatch) return new Date(Number.NaN);
  const target = Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    seconds,
  );
  let guess = target;
  const zone = normalizeTimeZone(timeZone);
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(new Date(guess), zone);
    const rendered = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const correction = target - rendered;
    guess += correction;
    if (correction === 0) break;
  }
  return new Date(guess);
}

export function utcCalendarStamp(
  iso: string,
  hhmm: string,
  timeZone: string,
  seconds = 0,
): string {
  const date = zonedDateTimeToDate(iso, hhmm, timeZone, seconds);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function timeZoneAbbreviation(timeZone: string, at = new Date()): string {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimeZone(timeZone),
    timeZoneName: "short",
  })
    .formatToParts(at)
    .find((item) => item.type === "timeZoneName");
  return part?.value ?? normalizeTimeZone(timeZone);
}
