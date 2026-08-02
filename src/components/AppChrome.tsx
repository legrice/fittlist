import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { fansVisible } from "@/lib/flags";
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
      avatarColor: schema.users.avatarColor,
      id: schema.users.id,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me) return null;

  const isCoach = me.kind !== "fan" && !!me.handle;
  const fans = await fansVisible();
  const unread = await unreadNotifications(userId);
  // The Schedule tab is the working calendar: a coach's at /app, a member's
  // at /week. You is the person, at /you for everyone.
  const scheduleHref = isCoach ? "/app" : "/week";
  const face = {
    photo: me.photo,
    color: avatarColor(me),
    initial: ((me.name.trim() || me.email).charAt(0) || "?").toUpperCase(),
  };

  const header = (
    <AppHeader
      unread={unread}
      // The logo goes to Following for everyone with the member side. It used
      // to send a coach to /app, which since the one-shell change is the bare
      // editable schedule: a page with no identity that read as showing up at
      // random.
      home={fans ? "/feed" : "/app"}
      search={fans}
      // The gear only where there is no You tab to hold the account: the
      // coaches-only mode has no tab bar, so the corner is the one door.
      settings={fans ? undefined : "/you"}
      nav={(headerNav ?? bar) ? { coach: isCoach, scheduleHref, active } : undefined}
    />
  );
  if (!bar) return header;
  return (
    <>
      {header}
      <NavBar coach={isCoach} face={face} scheduleHref={scheduleHref} active={active} />
    </>
  );
}
