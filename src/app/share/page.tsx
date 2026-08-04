import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { todayIso } from "@/lib/format";
import { myWeek } from "@/lib/week";
import { ShareComposer } from "@/components/ShareComposer";

export const dynamic = "force-dynamic";

// The share composer, opened by the middle of the tab bar.
//
// It is a full screen rather than a sheet, and it deliberately carries no tab
// bar: it opens over the app and the X is the way off, so nothing competes
// with the picture for the space. That is the one thing the old editor got
// most wrong, where the preview sat under three controls and was cropped by
// the time you scrolled to it.
export default async function SharePage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) redirect("/");
  if (me.handle && !me.onboardedAt) redirect("/welcome");

  // The range starts on the first day their week actually holds something.
  // Opening on an empty picture somebody then has to debug is the failure the
  // member's sheet already learned once.
  const week = await myWeek(userId);
  const today = todayIso();
  const first = week.find((d) => d.items.length > 0)?.iso;

  return (
    <ShareComposer
      canCoach={me.kind !== "fan"}
      hasPhoto={!!me.photo}
      hasCity={!!(me.location ?? "").trim()}
      today={today}
      firstIso={first && first > today ? first : today}
    />
  );
}
