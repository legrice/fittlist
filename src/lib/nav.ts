// One list of tabs for the two things that render them: the bottom bar on a
// phone, the header links on a desktop. They have to name the same places and
// light up on the same routes, so neither owns the list.

/** "none" is a screen off the tabs: your week, updates, settings. */
export type NavTab = "following" | "discover" | "you" | "none";

export type NavItem = {
  id: NavTab;
  href: string;
  icon: string;
  label: string;
  /** Render the viewer's own face instead of the icon. */
  face?: boolean;
};

/**
 * The same three tabs for everyone.
 *
 * A member used to get two and a coach three, which meant the app rearranged
 * itself the moment somebody started coaching, and every screen had to know
 * which shell it was in. Both sides have a page of their own now, so both get
 * the tab; only where it points differs.
 */
export function navTabs(coach: boolean, youHref?: string): NavItem[] {
  return [
    // Classes, not Following: the tab is named for what you get, and the
    // coach rail inside already says who you follow.
    { id: "following", href: "/feed", icon: "event", label: "Classes" },
    { id: "discover", href: "/discover", icon: "search", label: "Discover" },
    // Your own page, as everyone else sees it. It carries your face rather
    // than an icon: it's the one tab that is a person rather than a place. A
    // coach's is their public profile (the caller passes the handle URL in),
    // so the tab answers "what does my page look like" in one tap; the
    // editable week stays behind the settings gear and the three-dot menu.
    { id: "you", href: youHref ?? (coach ? "/app" : "/you"), icon: "account_circle", label: "You", face: true },
  ];
}

/** Where you are. The pathname usually says it; the schedule passes `active`
 *  explicitly, because there the account is an overlay on the same route and
 *  the tab has to stay lit. */
export function activeTab(pathname: string, active?: NavTab): NavTab {
  if (active) return active;
  if (pathname.startsWith("/discover")) return "discover";
  if (pathname.startsWith("/feed")) return "following";
  if (pathname.startsWith("/app") || pathname.startsWith("/you")) return "you";
  return "none";
}
