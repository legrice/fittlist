/** Both the month browser and its server action use the same finite horizon.
 * Each request still expands no more than one month of occurrences. */
export const FOLLOWING_MAX_MONTHS_AHEAD = 60;
export const CALENDAR_WINDOW_DAYS = 31;
const DAY_MS = 86_400_000;

export type CalendarDateWindow = { from: string; through: string };

function dateValue(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const value = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === iso ? value : null;
}

/** Validate dates rather than allowing JavaScript to normalize February 31. */
export function boundedCalendarWindow(window: CalendarDateWindow): CalendarDateWindow {
  const first = dateValue(window.from);
  const last = dateValue(window.through);
  if (first === null || last === null || last < first || last - first >= CALENDAR_WINDOW_DAYS * DAY_MS) {
    throw new Error("Choose a calendar range of up to 31 days.");
  }
  return { from: window.from, through: window.through };
}

export function followingMonthWindow(month: unknown, today: string): (CalendarDateWindow & { month: string }) | null {
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || dateValue(today) === null) return null;
  const currentMonth = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1;
  const requestedMonth = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
  const ahead = requestedMonth - currentMonth;
  if (ahead < 0 || ahead > FOLLOWING_MAX_MONTHS_AHEAD) return null;
  const first = `${month}-01`;
  const end = new Date(`${first}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  return { month, ...boundedCalendarWindow({ from: first < today ? today : first, through: end.toISOString().slice(0, 10) }) };
}

export function rollingCalendarWindow(today: string, startDay = 0, endDay = 30): CalendarDateWindow {
  const todayValue = dateValue(today);
  if (todayValue === null || !Number.isSafeInteger(startDay) || !Number.isSafeInteger(endDay) || startDay < 0 || endDay < startDay) {
    throw new Error("Choose a valid calendar range.");
  }
  const end = Math.min(endDay, startDay + CALENDAR_WINDOW_DAYS - 1);
  return boundedCalendarWindow({
    from: new Date(todayValue + startDay * DAY_MS).toISOString().slice(0, 10),
    through: new Date(todayValue + end * DAY_MS).toISOString().slice(0, 10),
  });
}
