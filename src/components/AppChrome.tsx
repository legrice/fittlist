import { avatarColor } from "@/lib/avatar";
import { unreadHeaderCounts } from "@/lib/notify";
import { adminAttentionCount, adminEmails } from "@/lib/admin";
import { AppHeader } from "@/components/AppHeader";
import { NavBar } from "@/components/NavBar";
import type { NavTab } from "@/lib/nav";
import { DesktopChrome } from "@/components/DesktopChrome";
import { adminActivityFreshSince } from "@/lib/adminactivity";
import { currentUser } from "@/lib/current-user";
import { ClientCacheScope } from "@/components/ClientCacheScope";
import { managedCalendarsForUser } from "@/lib/managed-calendars";

// The app shell, for the screens that aren't the tabbed layout or the coach's
// schedule. Those two build it themselves because they already hold the counts;
// everything else in the app gets it from here, so no signed-in screen is left
// without a way home, search, updates, settings, or the tabs.
//
// `bar` renders the bottom tabs as well. It's a second element rather than a
// wrapper because these screens all lay themselves out differently, and the
// header goes at the top of their column while the bar is fixed to the window.
export async function AppChrome({
  userId,
  bar = false,
  headerNav,
  active,
  social = false,
  mobileHeader = true,
}: {
  userId: string;
  bar?: boolean;
  /** The tabs as header links too, for the width where the bottom bar hides.
   *  Follows `bar` by default, because a screen with tabs has to keep them at
   *  every width: above 940px the bottom bar is gone and without these there
   *  is no navigation at all. The one opt-out is a profile, whose header
   *  floats over a photograph in white, where a row of ink links is a row
   *  nobody can read. */
  headerNav?: boolean;
  /** Light a tab the pathname alone can't name: your own profile is You. */
  active?: NavTab;
  /** Use the current calendar shell: create left, wordmark centered, alerts right. */
  social?: boolean;
  /** Keep desktop navigation while omitting the phone header on visited profiles. */
  mobileHeader?: boolean;
}) {
  // AppChrome and an enclosing route layout often need the same viewer. The
  // cached identity loader keeps that to one small projection instead of two
  // full users queries before any page content can stream.
  const me = await currentUser();
  if (!me || me.id !== userId) return null;

  const isCoach = me.kind !== "fan" && !!me.handle;
  const isAdmin = adminEmails().includes(me.email.toLowerCase());
  const [unread, adminAttention, adminActivityFresh, managedCalendars] = await Promise.all([
    unreadHeaderCounts(userId, me.email),
    isAdmin ? adminAttentionCount() : Promise.resolve(0),
    isAdmin ? adminActivityFreshSince(me.adminActivityAt) : Promise.resolve(false),
    managedCalendarsForUser(userId),
  ]);
  const adminActivity = adminActivityFresh ? 1 : 0;
  // One calendar, at one address. This forked by kind for months, back when a
  // coach's was /app and a member had their own at /week; a member has no
  // calendar at all now, and the tab is not drawn for them. Left as it was, it
  // quietly overrode the Calendar tab's href on every screen outside the tabs
  // layout, which is most of them.
  const scheduleHref = "/calendar";
  // The header avatar is the private You/account door. Public profiles stay
  // available through the profile's own sharing tools.
  const profileHref = "/you";
  const face = {
    photo: me.photoThumb ?? me.photo,
    color: avatarColor(me),
    initial: ((me.name.trim() || me.email).charAt(0) || "?").toUpperCase(),
  };
  const accountData = {
    me: {
      name: me.name.trim() || me.email.split("@")[0],
      handle: me.handle!,
      title: me.title?.trim() ?? "",
      location: me.location?.trim() ?? "",
      photo: face.photo,
      color: face.color,
      coaching: isCoach,
    },
    managed: [],
    shareHref: isCoach ? "/coachshare" : "/membershare",
    isAdmin,
    unread,
  };

  const header = (
    <>
      <ClientCacheScope viewerId={userId}>{null}</ClientCacheScope>
      <DesktopChrome
        coach={isCoach}
        scheduleHref={scheduleHref}
        profileHref={profileHref}
        notificationUnread={unread.notifications}
        messageUnread={unread.messages}
        admin={isAdmin}
        adminAttention={adminAttention}
        adminActivity={adminActivity}
        active={active}
        managedCalendars={managedCalendars}
        person={{
          name: me.name.trim() || me.email.split("@")[0],
          location: me.location,
          photo: me.photoThumb ?? me.photo,
          color: face.color,
          initial: face.initial,
        }}
      />
      {mobileHeader&&<AppHeader
        notificationUnread={unread.notifications}
        messageUnread={unread.messages}
        // The shared calendar feed is the signed-in front door. Keeping this
        // explicit makes screens outside the tabs agree with the main shell.
        home="/feed"
        admin={isAdmin}
        adminAttention={adminAttention}
        adminActivity={adminActivity}
        face={face}
        profileHref={profileHref}
        accountData={accountData}
        social={social}
      />}
    </>
  );
  if (!bar) return header;
  return (
    <>
      {header}
      <NavBar
        coach={isCoach}
        scheduleHref={scheduleHref}
        profileHref={profileHref}
        active={active}
        unread={unread.notifications > 0 || unread.messages > 0}
      />
    </>
  );
}
