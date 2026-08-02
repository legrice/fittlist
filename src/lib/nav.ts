// One list of tabs for the two things that render them: the bottom bar on a
// phone, the header links on a desktop. They have to name the same places and
// light up on the same routes, so neither owns the list.

/** "none" is a screen off the tabs: updates, a class page. */
export type NavTab = "following" | "discover" | "schedule" | "you" | "none";

export type NavItem = {
  id: NavTab;
  href: string;
  icon: string;
  label: string;
  /** Render the viewer's own face instead of the icon. */
  face?: boolean;
};

/**
 * The same four tabs for everyone.
 *
 * A member used to get two and a coach three, which meant the app rearranged
 * itself the moment somebody started coaching, and every screen had to know
 * which shell it was in. Both sides have a page of their own now, so both get
 * the tab; only where it points differs.
 */
export function navTabs(coach: boolean, scheduleHref?: string): NavItem[] {
  return [
    // No Plans anywhere: the ribbon tried the tab bar, then the header
    // corner, and then the list it pointed at merged into the calendar.
    // Following leads because the merged week is the thing the app is for.
    { id: "following", href: "/feed", icon: "groups", label: "Following" },
    // The compass again: the header got its magnifier back once the plans
    // ribbon left, and a magnifier on the tab beside a magnifier in the
    // corner was the same glyph twice on one screen. Discover is browsing;
    // searching is the header's corner and the box at the top of this tab.
    { id: "discover", href: "/discover", icon: "travel_explore", label: "Discover" },
    // The working calendar, one tap from anywhere and behind nothing: the
    // one time it sat behind another screen it got buried, and that was bad
    // enough to reverse. A coach's is /app, a member's /week.
    { id: "schedule", href: scheduleHref ?? (coach ? "/app" : "/week"), icon: "calendar_today", label: "Schedule" },
    // The person: profile, sharing, and the account rows, one screen for
    // both kinds. It carries your face rather than an icon, because it's the
    // one tab that is a person rather than a place.
    { id: "you", href: "/you", icon: "account_circle", label: "You", face: true },
  ];
}

/** Where you are. The pathname usually says it; a screen off the tabs that
 *  still belongs to one (your own profile) passes `active` explicitly. */
export function activeTab(pathname: string, active?: NavTab): NavTab {
  if (active) return active;
  if (pathname.startsWith("/discover")) return "discover";
  if (pathname.startsWith("/feed")) return "following";
  // Both calendars are the Schedule tab: a coach's at /app, a member's at
  // /week. The person is /you.
  if (pathname.startsWith("/week") || pathname.startsWith("/app")) return "schedule";
  if (pathname.startsWith("/you")) return "you";
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
  if (from === "home") return { href: "/feed", label: "Back to Following" };
  if (from === "schedule") return { href: "/app", label: "Back to your schedule" };
  return signedIn ? { href: "/feed", label: "Back to Following" } : { href: "/", label: "Back" };
}
