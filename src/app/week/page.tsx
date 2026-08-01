import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { myWeek } from "@/lib/week";
import { AppChrome } from "@/components/AppChrome";
import { avatarColor } from "@/lib/avatar";
import { WeekScreen } from "@/components/WeekScreen";

export const dynamic = "force-dynamic";

// The shortlist behind the header icon. Its own route rather than a tab,
// because it's reachable from every screen and isn't one of the three places
// you browse from.
export default async function WeekPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db
    .select({
      look: schema.users.look,
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
  // A member has nothing behind the Schedule tab, same rule as everywhere else.
  const isCoach = me?.kind !== "fan" && !!me?.handle;

  const days = await myWeek(userId);
  // No .appshell wrapper: that's `height: 100dvh; overflow: hidden` and expects
  // a .stage child to do the scrolling. Wrapped in one without a stage, a week
  // with more classes than fit simply got clipped and the page wouldn't move.
  // Every other standalone screen (/requests, /followers) scrolls the document.
  return (
    <div data-mode={me?.look === "dark" ? "dark" : undefined}>
      {/* Your week is reached from the header, not the tab bar, but it's still
          inside the app: leaving it shouldn't mean finding the back button. */}
      <WeekScreen
        days={days}
        header={<AppChrome userId={userId} />}
        coach={isCoach}
        youHref={isCoach ? "/app" : "/you"}
        face={{
          photo: me?.photo ?? null,
          color: me ? avatarColor(me) : "#dd6a35",
          initial: ((me?.name?.trim() || me?.email || "?").charAt(0) || "?").toUpperCase(),
        }}
      />
    </div>
  );
}
