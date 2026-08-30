import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ShareHubScreen, type HubItem } from "@/components/ShareHubScreen";
import { getDb, schema } from "@/db";
import { todayIso } from "@/lib/format";
import { shareWeek } from "@/lib/shareweek";
import { getSessionUserId } from "@/lib/session";
import { sanitizeSavedStoryLooks, sanitizeShareDesign } from "@/lib/share-design";
import type { LastUsed } from "@/lib/types";

// One screen, two addresses: page modules cannot export shared helpers, so
// both route pages call this renderer from a route-adjacent non-page module.
export async function hubPage(address: "member" | "coach") {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const today = todayIso();
  const [userRows, days] = await Promise.all([
    db
      .select({
        kind: schema.users.kind,
        handle: schema.users.handle,
        name: schema.users.name,
        storyPrefs: schema.users.storyPrefs,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId)),
    shareWeek(userId, today, 14),
  ]);
  const [me] = userRows;
  if (!me?.handle) redirect("/you");

  const coach = me.kind !== "fan";
  if (coach && address === "member") redirect("/coachshare");
  if (!coach && address === "coach") redirect("/membershare");

  let defaultFrom = today;
  const items: HubItem[] = days.flatMap((d) =>
    d.items.map((it) => ({
      key: it.key,
      iso: it.iso,
      time: it.time,
      name: it.name,
      own: it.own,
      coaching: it.coaching,
    })),
  );
  defaultFrom = days[0]?.iso ?? defaultFrom;

  const lastUsed: LastUsed = { startTime: "18:00", durationMin:60, studioId:null };

  return (
    <ShareHubScreen
      tabbed
      coach={coach}
      handle={me.handle}
      items={items}
      defaultFrom={defaultFrom}
      today={today}
      savedHeadline={me.storyPrefs?.headline ?? ""}
      hasBackground={!!me.storyPrefs?.background}
      studios={[]}
      templates={[]}
      customTypes={[]}
      lastUsed={lastUsed}
      initialRevision={Date.now()}
      initialDesign={me.storyPrefs?.design ? sanitizeShareDesign(me.storyPrefs.design) : null}
      savedLooks={sanitizeSavedStoryLooks(me.storyPrefs?.savedLooks)}
      deferAdderData={!coach}
    />
  );
}
