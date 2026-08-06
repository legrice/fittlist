import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { todayIso } from "@/lib/format";
import { shareWeek } from "@/lib/shareweek";
import { getSessionUserId } from "@/lib/session";
import { ShareHubScreen, type HubItem } from "@/components/ShareHubScreen";

export const dynamic = "force-dynamic";

// The Share tab's screen: one surface with Week, Profile and QR code as
// segments, colours that redraw the picture live, and the big save button.
// It lives in the tabs group so the bar stays under it; Share is a place
// you go, not a sheet that visits.
export default async function ShareHubPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db
    .select({ kind: schema.users.kind, handle: schema.users.handle, name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  // No handle means mid-signup, and nothing here works without a page to
  // point at; /you sorts out where they should be.
  if (!me?.handle) redirect("/you");

  const coach = me.kind !== "fan";
  // A member's bar carries no Share tab, so this screen has no door for
  // them; a typed URL lands back on the one screen they live in.
  if (!coach) redirect("/feed");
  // A fortnight of what the picture could hold, for the Dates and Classes
  // pickers: the range moves client-side, so the screen gets the whole
  // window and filters. Same loader as the image route, so the picker and
  // the picture cannot disagree about what exists.
  const today = todayIso();
  let items: HubItem[] = [];
  let defaultFrom = today;
  if (coach) {
    const days = await shareWeek(userId, defaultFrom, 14);
    items = days.flatMap((d) =>
      d.items.map((it) => ({ key: it.key, iso: it.iso, time: it.time, name: it.name })),
    );
    // Start where the week has something: the empty poster should never be
    // the first one anybody sees.
    defaultFrom = days[0]?.iso ?? defaultFrom;
  }

  return (
    <ShareHubScreen
      coach={coach}
      handle={me.handle}
      name={me.name.trim() || me.handle}
      items={items}
      defaultFrom={defaultFrom}
      today={today}
    />
  );
}
