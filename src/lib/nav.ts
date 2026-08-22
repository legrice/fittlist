// One list of tabs for the two things that render them: the bottom bar on a
// phone, the header links on a desktop. They have to name the same places and
// light up on the same routes, so neither owns the list.

/** "none" is a screen off the tabs: updates, a class page. */
export type NavTab = "following" | "discover" | "calendar" | "none";

export type NavItem = {
  id: NavTab;
  href: string;
  icon: string;
  label: string;
};

/**
 * Three jobs, not three content types: use schedules, find schedules, and
 * manage the calendars that belong to you.
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
      id: "following" as const,
      href: "/feed",
      icon: "calendar_month",
      label: "Schedules",
    },
    { id: "discover", href: "/search", icon: "search", label: "Find" },
    { id: "calendar", href: profileHref ?? "/you", icon: "person", label: "Manage" },
  ];
}

/** Where you are. The pathname usually says it; a screen off the tabs that
 *  still belongs to one (your own profile) passes `active` explicitly. */
export function activeTab(pathname: string, active?: NavTab): NavTab {
  if (active) return active;
  // /week is retained only as an old address for the calendar.
  if (pathname.startsWith("/feed") || pathname.startsWith("/upcoming")) return "following";
  if (pathname.startsWith("/calendar") || pathname.startsWith("/app") || pathname.startsWith("/week") || pathname.startsWith("/you"))
    return "calendar";
  if (pathname.startsWith("/discover") || pathname.startsWith("/search")) return "discover";
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
  if (from === "discover" || from === "discover-classes") return { href: "/discover?half=classes", label: "Back to classes" };
  if (from === "discover-people") return { href: "/discover?half=people", label: "Back to people" };
  if (from === "discover-studios") return { href: "/discover?half=studios", label: "Back to studios" };
  if (from === "discover-groups") return { href: "/discover?half=groups", label: "Back to groups" };
  if (from === "saved") return { href: "/saved", label: "Back to Favorites" };
  if (from === "search") return { href: "/search", label: "Back to search" };
  // Old links carrying former Home tokens still need a stable signed-in
  // destination. Following is the front door again, so the general fallback
  // below is also the honest place for those links to land.
  if (from === "schedule") return { href: "/calendar", label: "Back to your calendar" };
  // Following is the one shared screen every signed-in account can open,
  // regardless of whether they publish a calendar themselves.
  return signedIn ? { href: "/feed", label: "Back to calendar" } : { href: "/", label: "Back" };
}
