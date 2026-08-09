import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { storyLook, todayIso as todayIsoNow } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { headlineOf, renderStory } from "@/lib/storyimage";
import { listBudget, planStory } from "@/lib/storyplan";
import { shareRange, shareWeek } from "@/lib/shareweek";

// The member's share image: the classes they marked going, plus the entries
// they keep themselves. The mirror of the coach's "Train with me": this one
// says "come with me", and it carries the coaches' names out to the member's
// friends, who are exactly the people most likely to show up.
//
// The rows come from `shareWeek` and the paint from `storyimage`, both shared
// with the composer, so the sheet and the composer can't draw different weeks.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return new Response("Not found", { status: 404 });
  const qs = new URL(req.url).searchParams;
  // Style first, then one of the three colourways that style is offered in.
  // Colour belongs to the style rather than sitting beside it, so a diner
  // sign is never asked to wear Midnight.
  const [, y, t] = storyLook(qs.get("style"), qs.get("palette") ?? qs.get("theme"));

  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return new Response("Not found", { status: 404 });

  const { from, days } = shareRange(qs.get("from"), qs.get("days"));
  const byDay = await shareWeek(userId, from, days);


  const prefs = me.storyPrefs ?? {};
  const { line1, line2, size: hSize } = headlineOf(prefs.headline ?? "", ["Come", "with me."]);
  const showPhoto = prefs.showPhoto !== false && !!me.photo;
  const myHandle = (me.handle ?? "").trim();

  const plan = planStory(
    byDay.map(({ day, items }) => ({
      day,
      items: items.map((c) => ({ time: c.time, name: c.name, where: c.where, who: c.who })),
    })),
    listBudget(hSize * 0.98 * (line2 ? 2 : 1) + 78) / y.rowScale,
  );

  return renderStory({
    theme: t,
    style: y,
    format: "story",
    line1,
    line2,
    headlineSize: hSize,
    photo: showPhoto ? me.photo : null,
    plan,
    empty: byDay.length === 0,
    emptyLine: "Nothing marked yet this week.",
    url: myHandle ? `fittlist.co/${myHandle}` : "fittlist.co",
  });
}
