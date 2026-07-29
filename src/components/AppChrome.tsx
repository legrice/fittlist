import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { unreadNotifications } from "@/lib/notify";
import { weekCount } from "@/lib/week";
import { AppHeader } from "@/components/AppHeader";
import { NavBar } from "@/components/NavBar";

// The app shell, for the screens that aren't the tabbed layout or the coach's
// schedule. Those two build it themselves because they already hold the counts;
// everything else in the app gets it from here, so no signed-in screen is left
// without a way home, the bell, your week, or the tabs.
//
// `bar` renders the bottom tabs as well. It's a second element rather than a
// wrapper because these screens all lay themselves out differently, and the
// header goes at the top of their column while the bar is fixed to the window.
export async function AppChrome({ userId, bar = false }: { userId: string; bar?: boolean }) {
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
  const [unread, week] = await Promise.all([unreadNotifications(userId), weekCount(userId)]);
  const face = {
    photo: me.photo,
    color: avatarColor(me),
    initial: ((me.name.trim() || me.email).charAt(0) || "?").toUpperCase(),
  };

  const header = (
    <AppHeader
      unread={unread}
      weekCount={week}
      home={isCoach ? "/app" : "/feed"}
      // The same corner for everyone: your week, the bell, settings. The face
      // left it when it became the You tab.
      settingsHref={isCoach ? "/app?acct=1" : "/you"}
    />
  );
  if (!bar) return header;
  return (
    <>
      {header}
      <NavBar coach={isCoach} face={face} />
    </>
  );
}
