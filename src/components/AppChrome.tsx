import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { adminEmails } from "@/lib/admin";
import { adminActivityFreshSince } from "@/lib/adminactivity";
import { avatarColor } from "@/lib/avatar";
import { fansVisible, landingHref } from "@/lib/flags";
import { unreadNotifications } from "@/lib/notify";
import { AppHeader } from "@/components/AppHeader";
import { NavBar } from "@/components/NavBar";
import type { NavTab } from "@/lib/nav";

// The app shell, for the screens that aren't the tabbed layout or the coach's
// schedule. Those two build it themselves because they already hold the counts;
// everything else in the app gets it from here, so no signed-in screen is left
// without a way home, the bell, your week, or the tabs.
//
// `bar` renders the bottom tabs as well. It's a second element rather than a
// wrapper because these screens all lay themselves out differently, and the
// header goes at the top of their column while the bar is fixed to the window.
export async function AppChrome({
  userId,
  bar = false,
  headerNav,
  active,
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
}) {
  const db = await getDb();
  const [me] = await db
    .select({
      kind: schema.users.kind,
      handle: schema.users.handle,
      name: schema.users.name,
      email: schema.users.email,
      photo: schema.users.photo,
      photoThumb: schema.users.photoThumb,
      avatarColor: schema.users.avatarColor,
      adminActivityAt: schema.users.adminActivityAt,
      id: schema.users.id,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me) return null;

  const isCoach = me.kind !== "fan" && !!me.handle;
  // The admin's own pulse rides the header beside the bell, for the one or
  // two accounts that have /admin at all: the same activity list the admin
  // screen shows, one tap from anywhere.
  const isAdmin = adminEmails().includes(me.email.toLowerCase());
  const fans = await fansVisible();
  const unread = await unreadNotifications(userId);
  // One calendar, at one address. This forked by kind for months, back when a
  // coach's was /app and a member had their own at /week; a member has no
  // calendar at all now, and the tab is not drawn for them. Left as it was, it
  // quietly overrode the Calendar tab's href on every screen outside the tabs
  // layout, which is most of them.
  const scheduleHref = "/calendar";
  // Profile is your own page. It falls back to /you (a redirect) for an
  // account still mid-signup, which has no handle to point at yet.
  const profileHref = me.handle ? `/${me.handle}` : "/you";
  const face = {
    photo: me.photoThumb ?? me.photo,
    color: avatarColor(me),
    initial: ((me.name.trim() || me.email).charAt(0) || "?").toUpperCase(),
  };

  const header = (
    <AppHeader
      unread={unread}
      // The logo goes to the landing tab for everyone with the member side.
      // It used to send a coach to /app, which since the one-shell change is
      // the bare editable schedule: a page with no identity that read as
      // showing up at random.
      home={fans ? await landingHref() : "/app"}
      // No magnifier and no gear, by Matt's call: Search is a tab and
      // settings are the circle on your own profile. The gear survives only
      // where there is no member side at all: the coaches-only mode has no
      // tab bar, so it is the one door to the account.
      settings={fans ? undefined : "/settings"}
      adminActivity={isAdmin}
      adminActivityNew={isAdmin && (await adminActivityFreshSince(me.adminActivityAt))}
      nav={(headerNav ?? bar) ? { coach: isCoach, scheduleHref, profileHref, active } : undefined}
    />
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
        face={face}
      />
    </>
  );
}
