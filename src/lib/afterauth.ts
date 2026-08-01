// Where to put somebody down once they're in.
//
// A visitor who taps Sign in from a coach's page is not asking to see their
// own feed; they are part way through doing something on that page, and the
// app used to end the sign-in flow on /feed and leave them to find their way
// back. Whatever they were doing was usually gone by then.
//
// sessionStorage rather than a query string, because the way in is not one
// hop: the sheet, the passkey prompt, a three-step wizard for somebody brand
// new. A parameter would have to survive every one of those, and the first
// step that forgot to pass it on would drop them silently. It is read once and
// cleared, so a stale destination can't hijack a later sign-in in the same tab.

const KEY = "fl-after-auth";

/** Only ever our own pages: a destination read from a URL is somebody else's
 *  input, and "//evil.example" is a same-looking path that isn't one. */
function safe(path: string | null | undefined): string | null {
  if (!path) return null;
  return /^\/(?!\/)[^\s]*$/.test(path) ? path : null;
}

export function rememberAfterAuth(path: string | null | undefined): void {
  const ok = safe(path);
  if (!ok || typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, ok);
  } catch {
    // Private mode, a full quota: losing the destination is a worse landing,
    // not a broken sign-in.
  }
}

/** The destination, once. Null if there isn't one. */
export function takeAfterAuth(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = safe(sessionStorage.getItem(KEY));
    sessionStorage.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}
