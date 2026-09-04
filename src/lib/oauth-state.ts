import { timingSafeEqual } from "node:crypto";

export const APPLE_LOGIN_STATE_COOKIE = "fl_apple_login_state";
export const GOOGLE_LOGIN_STATE_COOKIE = "fl_google_login_state";
export const GOOGLE_CALENDAR_STATE_COOKIE = "fl_google_calendar_state";

/** Compare an OAuth callback's state with the browser-bound HttpOnly copy
 * without leaking a useful prefix through comparison timing. */
export function oauthStateMatches(expected: string | undefined, actual: string): boolean {
  if (!expected) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}
