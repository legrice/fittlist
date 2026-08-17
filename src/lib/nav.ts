// One list of tabs for the two things that render them: the bottom bar on a
// phone, the header links on a desktop. They have to name the same places and
// light up on the same routes, so neither owns the list.

/** "none" is a screen off the tabs: updates, a class page. */
export type NavTab = "calendar" | "discover" | "saved" | "none";

export type NavItem = {
  id: NavTab;
  href: string;
  icon: string;
  label: string;
};

/**
 * Calendar is the signed-in front door. Discover finds people and places;
 * Favorites keeps separate shortcuts to the people, places, and groups this
 * person wants nearby. Saved is reserved for classes on their calendar.
 */
export function navTabs(
  _coach: boolean,
  scheduleHref?: string,
  /** Your own profile. It is your public page, so it is your handle; the tab
   *  falls back to /you, which redirects there, for a shell that has not been
   *  handed the handle. */
  profileHref?: string,
): NavItem[] {
  return [
    {
      id: "calendar" as const,
      href: scheduleHref ?? "/calendar",
      icon: "calendar_month",
      label: "Calendar",
    },
    { id: "discover", href: "/discover", icon: "travel_explore", label: "Discover" },
    { id: "saved", href: "/saved", icon: "favorite", label: "Favorites" },
  ];
}

/** Where you are. The pathname usually says it; a screen off the tabs that
 *  still belongs to one (your own profile) passes `active` explicitly. */
export function activeTab(pathname: string, active?: NavTab): NavTab {
  if (active) return active;
  // /week is retained only as an old address for the calendar.
  if (pathname.startsWith("/calendar") || pathname.startsWith("/app"))
    return "calendar";
  if (pathname.startsWith("/week")) return "calendar";
  if (pathname.startsWith("/discover") || pathname.startsWith("/search")) return "discover";
  if (pathname.startsWith("/saved")) return "saved";
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
  if (from === "discover") return { href: "/discover", label: "Back to Explore" };
  if (from === "search") return { href: "/search", label: "Back to search" };
  // The Home tab is parked, so its token answers like anything unknown:
  // the front door. Old links carrying ?from=home still land somewhere real.
  // Following is parked, so its token answers like anything unknown: the front
  // door, which is the calendar now. Old links carrying ?from=following and
  // ?from=home still land somewhere real, which is the whole reason this
  // function never answers null.
  if (from === "schedule") return { href: "/calendar", label: "Back to your calendar" };
  // The cold-open fallback is the calendar: it has to land somewhere every
  // signed-in viewer can actually open, and /week sends a coach to /app.
  // Following for a signed-in viewer: it is the one screen everybody has, and
  // a member has no calendar to be sent back to.
  return signedIn ? { href: "/calendar", label: "Back to your calendar" } : { href: "/", label: "Back" };
}
