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
