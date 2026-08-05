// One list of tabs for the two things that render them: the bottom bar on a
// phone, the header links on a desktop. They have to name the same places and
// light up on the same routes, so neither owns the list.

/** "none" is a screen off the tabs: updates, a class page. */
export type NavTab = "following" | "discover" | "share" | "schedule" | "you" | "none";

export type NavItem = {
  id: NavTab;
  href: string;
  icon: string;
  label: string;
};

/**
 * Two tabs, for everyone.
 *
 * It was five for a while: Share took the middle and You carried your face at
 * the end. Both have come off, by Matt's call. Share is an act rather than a
 * place and it now opens from the one screen it is about, the calendar's own
 * Share button; You is a person rather than a place either, and your face
 * sits in the header's top right where a profile door usually lives. What is
 * left is the three screens you actually move between, which is what a bottom
 * bar is for.
 *
 * A member used to get two and a coach three, which meant the app rearranged
 * itself the moment somebody started coaching, and every screen had to know
 * which shell it was in. Both sides have a page of their own now, so both get
 * the tab; only where it points differs.
 */
export function navTabs(coach: boolean, scheduleHref?: string): NavItem[] {
  return [
    // Two tabs. Following was the third and is gone: it was a merged week of
    // the coaches you follow, and following no longer delivers a week. It
    // delivers a face at the top of Schedule, and the classes behind that face
    // reach your calendar only when you save them. A tab pointing at a screen
    // whose whole content has moved into another tab is a second door onto one
    // room.
    //
    // Discover, wearing the magnifier again. It carried the compass while the
    // header's corner held a magnifier of its own, because the same glyph
    // must never be drawn twice on one screen; the corner is your face now,
    // so the mark comes back to the tab that means finding something.
    { id: "discover", href: "/discover", icon: "search", label: "Discover" },
    // The working calendar, one tap from anywhere and behind nothing: the
    // one time it sat behind another screen it got buried, and that was bad
    // enough to reverse. A coach's is /app, a member's /week.
    { id: "schedule", href: scheduleHref ?? (coach ? "/app" : "/week"), icon: "calendar_today", label: "Schedule" },
  ];
}

/** Where you are. The pathname usually says it; a screen off the tabs that
 *  still belongs to one (your own profile) passes `active` explicitly. */
export function activeTab(pathname: string, active?: NavTab): NavTab {
  if (active) return active;
  if (pathname.startsWith("/discover") || pathname.startsWith("/search")) return "discover";
  // /feed redirects onto the calendar now, so it lights the tab it lands on.
  // The route is kept rather than deleted because it was the app's front door
  // for months and is in emails, bookmarks and at least one home screen.
  if (pathname.startsWith("/feed")) return "schedule";
  // Both calendars are the Schedule tab: a coach's at /app, a member's at
  // /week. The person is /you.
  if (pathname.startsWith("/week") || pathname.startsWith("/app")) return "schedule";
  if (pathname.startsWith("/you")) return "you";
  if (pathname.startsWith("/share")) return "share";
  return "none";
}


/**
 * Where a back control goes, given the tab that sent them.
 *
 * A named destination lets the control name the list it pops to. It never
 * returns null: a profile carries no tab bar, so its arrow is the way off the
 * page and has to be on every one of them. The control pops to whatever is
 * really underneath, so this is the destination only for a page opened cold (a
 * shared link, a QR code, a search result), where nothing is underneath and
 * the front door is the honest answer. The studio page, a coach's profile and
 * a member's all ask this one function, which is why they answer alike.
 */
export function backToFor(from: string | undefined, signedIn: boolean): { href: string; label: string } {
  if (from === "discover") return { href: "/discover", label: "Back to Discover" };
  if (from === "search") return { href: "/search", label: "Back to search" };
  // The Home tab is parked, so its token answers like anything unknown:
  // the front door. Old links carrying ?from=home still land somewhere real.
  // Following is parked, so its token answers like anything unknown: the front
  // door, which is the calendar now. Old links carrying ?from=following and
  // ?from=home still land somewhere real, which is the whole reason this
  // function never answers null.
  if (from === "schedule") return { href: "/app", label: "Back to your schedule" };
  // The cold-open fallback is the calendar: it has to land somewhere every
  // signed-in viewer can actually open, and /week sends a coach to /app.
  return signedIn ? { href: "/week", label: "Back to your schedule" } : { href: "/", label: "Back" };
}
