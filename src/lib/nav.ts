// One list of tabs for the two things that render them: the bottom bar on a
// phone, the header links on a desktop. They have to name the same places and
// light up on the same routes, so neither owns the list.

/** "none" is a screen off the tabs: updates, settings, a class page. */
export type NavTab = "plans" | "following" | "discover" | "you" | "none";

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
export function navTabs(coach: boolean, youHref?: string): NavItem[] {
  return [
    // Plans lives in the header corner as the ribbon with its count, not
    // here: it tried leading the tabs, and a fourth tab crowded the bar for
    // a list you visit rather than live on. Following leads because the
    // merged week is the thing the app is for.
    { id: "following", href: "/feed", icon: "groups", label: "Following" },
    // The magnifier lives here now: the header lost its search icon, the
    // Discover box is the door to the universal search, and two doors to one
    // search said one thing twice.
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
  if (pathname.startsWith("/week")) return "plans";
  if (pathname.startsWith("/app") || pathname.startsWith("/you")) return "you";
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
