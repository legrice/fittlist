import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { storyTheme, todayIso as todayIsoNow } from "@/lib/format";
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
  const [, t] = storyTheme(qs.get("theme"));

  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return new Response("Not found", { status: 404 });

  const { from, days } = shareRange(qs.get("from"), qs.get("days"));
  const byDay = await shareWeek(userId, "going", from, days);

  // The kicker this sheet has always drawn: a range that starts today is still
  // "my week", and anything else names both of its ends.
  const shortDate = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  const last = new Date(Date.parse(`${from}T00:00:00Z`) + (days - 1) * 864e5)
    .toISOString()
    .slice(0, 10);
  const kicker =
    days === 1
      ? shortDate(from)
      : from === todayIsoNow()
        ? `My week of ${shortDate(from)}`
        : `${shortDate(from)} to ${shortDate(last)}`;

  const prefs = me.storyPrefs ?? {};
  const { line1, line2, size: hSize } = headlineOf(prefs.headline ?? "", ["Come train", "with me."]);
  const showPhoto = prefs.showPhoto !== false && !!me.photo;
  const city = (me.location ?? "").trim();
  const myHandle = (me.handle ?? "").trim();

  const plan = planStory(
    byDay.map(({ day, items }) => ({
      day,
      items: items.map((c) => ({ time: c.time, name: c.name, where: c.where, who: c.who })),
    })),
    listBudget(hSize * 0.98 * (line2 ? 2 : 1) + 78, !!city),
  );

  return renderStory({
    theme: t,
    format: "story",
    kicker,
    line1,
    line2,
    headlineSize: hSize,
    city,
    photo: showPhoto ? me.photo : null,
    plan,
    empty: byDay.length === 0,
    emptyLine: "Nothing marked yet this week.",
    verb: "Join me",
    url: myHandle ? `fittlist.co/${myHandle}` : "fittlist.co",
  });
}
