import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { unreadNotifications } from "@/lib/notify";
import { weekCount } from "@/lib/week";
import { AppHeader } from "@/components/AppHeader";

// The app header, for the screens that aren't the tabbed shell or the coach's
// schedule. Those two build it themselves because they already hold the counts;
// everything else in the app gets it from here, so no signed-in screen is left
// without a way home, the bell, or your week.
export async function AppChrome({ userId }: { userId: string }) {
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

  return (
    <AppHeader
      unread={unread}
      weekCount={week}
      home={isCoach ? "/app" : "/feed"}
      avatar={{
        photo: me.photo,
        color: avatarColor(me),
        initial: ((me.name.trim() || me.email).charAt(0) || "?").toUpperCase(),
        href: isCoach ? "/app?acct=1" : "/you",
      }}
    />
  );
}
