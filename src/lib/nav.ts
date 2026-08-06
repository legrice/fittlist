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
 * Three tabs at most, and the third only for somebody who teaches.
 *
 * | Account   | Tabs                            |
 * | --------- | ------------------------------- |
 * | Follows   | Following, Profile              |
 * | Teaches   | Calendar, Following, Profile    |
 *
 * This is the simplification the whole build is named for. The app had grown
 * a screen for every idea anybody had, and the answer is not a better bottom
 * bar, it is fewer things: build a calendar, share a calendar, follow a
 * calendar. Discovery is not a tab (it is the search button on Following),
 * settings are not a tab (they are the gear on Profile), and adding a class is
 * not a tab (it is the plus on Calendar). A tab is a place you live, not every
 * door in the building.
 *
 * A coach is not a different account, only a `users.kind` that carries a
 * calendar. Turning "I teach too" on in settings adds the Calendar tab and
 * lists them in Discover; turning it off takes both away. Same account, same
 * profile, no second signup, which is what makes the upgrade a decision rather
 * than a migration.
 */
export function navTabs(coach: boolean, scheduleHref?: string): NavItem[] {
  return [
    // Only for somebody who teaches, and first, because it is the thing they
    // opened the app to do.
    ...(coach
      ? [
          {
            id: "schedule" as const,
            href: scheduleHref ?? "/calendar",
            icon: "calendar_today",
            label: "Calendar",
          },
        ]
      : []),
    // Everyone you follow, as one week. It was deleted for a build while
    // following delivered a face instead of a week; it delivers the week
    // again, and this is the only screen a member has.
    { id: "following", href: "/feed", icon: "groups", label: "Following" },
    // Who you are, and where everything you manage lives: settings, your
    // studios, the rota. One level down from the tabs on purpose.
    { id: "you", href: "/you", icon: "account_circle", label: "Profile" },
  ];
}

/** Where you are. The pathname usually says it; a screen off the tabs that
 *  still belongs to one (your own profile) passes `active` explicitly. */
export function activeTab(pathname: string, active?: NavTab): NavTab {
  if (active) return active;
  // Discover is not a tab any more: it is the search button on Following and
  // the plus at the end of the rail, both opening the same sheet. The routes
  // stay reachable, and light Following, because that is where they open from.
  if (pathname.startsWith("/discover") || pathname.startsWith("/search")) return "following";
  if (pathname.startsWith("/feed")) return "following";
  // The Calendar tab is a coach's own classes. /week was a member's calendar
  // and is now a redirect onto Following, because a member has no calendar of
  // their own: they read the week of the people they follow.
  if (pathname.startsWith("/calendar") || pathname.startsWith("/app")) return "schedule";
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
  // Following for a signed-in viewer: it is the one screen everybody has, and
  // a member has no calendar to be sent back to.
  return signedIn ? { href: "/feed", label: "Back to Following" } : { href: "/", label: "Back" };
}
