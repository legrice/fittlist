import { todayIso } from "@/lib/format";

type AwayWindow = {
  away: boolean;
  awayStartsOn?: string | null;
  awayEndsOn?: string | null;
  timeZone?: string | null;
};

/** Date bounds are inclusive and follow the profile owner's local day. */
export function isAwayActive(window: AwayWindow, now = new Date()): boolean {
  if (!window.away) return false;
  const today = todayIso(now, window.timeZone || undefined);
  if (window.awayStartsOn && today < window.awayStartsOn) return false;
  if (window.awayEndsOn && today > window.awayEndsOn) return false;
  return true;
}

export function isDateInAwayWindow(window: AwayWindow, iso: string): boolean {
  if (!window.away || !window.awayStartsOn || !window.awayEndsOn) return false;
  return iso >= window.awayStartsOn && iso <= window.awayEndsOn;
}
