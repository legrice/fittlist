// One list of tabs for the two things that render them: the bottom bar on a
// phone, the header links on a desktop. They have to name the same places and
// light up on the same routes, so neither owns the list.

/** "none" is the account: reachable from either tab, and neither of them. */
export type NavTab = "following" | "discover" | "schedule" | "none";

export type NavItem = { id: NavTab; href: string; icon: string; label: string };

/** A member has nothing behind Schedule, so they get two. */
export function navTabs(coach: boolean): NavItem[] {
  return [
    { id: "following", href: "/feed", icon: "groups", label: "Following" },
    { id: "discover", href: "/discover", icon: "search", label: "Discover" },
    ...(coach
      ? [{ id: "schedule" as const, href: "/app", icon: "calendar_today", label: "Schedule" }]
      : []),
  ];
}

/** Where you are. The pathname usually says it; the schedule passes `active`
 *  explicitly, because there the account is an overlay on the same route and
 *  the tab has to stay lit. */
export function activeTab(pathname: string, active?: NavTab): NavTab {
  if (active) return active;
  if (pathname.startsWith("/discover")) return "discover";
  if (pathname.startsWith("/feed")) return "following";
  if (pathname.startsWith("/app")) return "schedule";
  return "none";
}
