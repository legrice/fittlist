import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { storyTheme } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { headlineOf, renderStory } from "@/lib/storyimage";
import { listBudget, planStory, type StoryFormat } from "@/lib/storyplan";
import { shareKicker, shareRange, shareWeek, type ShareKind } from "@/lib/shareweek";

// The composer's picture. One route for both hats and both canvases, because
// the composer is one screen: a second route per combination is four routes
// that have to agree about a headline.
//
// Everything is a query parameter and nothing is stored, so the preview redraws
// the moment a control moves and the thing that gets shared is the thing that
// was on screen. The one exception is the headline, which is also saved to the
// profile, because somebody's own words should survive closing the composer.

export const dynamic = "force-dynamic";

/** Defaults per hat. Never a blank field: the headline is derived from the
 *  segment and only overwritten when its owner types something. */
const FALLBACK: Record<ShareKind, [string, string]> = {
  coaching: ["Come train", "with me."],
  going: ["My", "week."],
};

export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return new Response("Not found", { status: 404 });
  const qs = new URL(req.url).searchParams;

  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return new Response("Not found", { status: 404 });

  // A member has one hat, so asking for the other gets the one they have
  // rather than an empty picture: the URL is not a way around the wall.
  const asked = qs.get("kind") === "coaching" ? "coaching" : "going";
  const kind: ShareKind = me.kind === "fan" ? "going" : asked;
  const [, t] = storyTheme(qs.get("theme"));
  const format: StoryFormat = qs.get("fmt") === "square" ? "square" : "story";
  const { from, days } = shareRange(qs.get("from"), qs.get("days"));
  const hide = new Set((qs.get("hide") ?? "").split(",").filter(Boolean));

  const byDay = await shareWeek(userId, kind, from, days, hide);

  const prefs = me.storyPrefs ?? {};
  // The headline rides the URL so the preview redraws without a round trip;
  // the saved one is the fallback for anything that isn't the composer.
  const typed = qs.get("headline") ?? prefs.headline ?? "";
  const { line1, line2, size } = headlineOf(typed, FALLBACK[kind]);

  const showPhoto = qs.get("photo") !== "0" && prefs.showPhoto !== false && !!me.photo;
  const showStudio = qs.get("studios") !== "0";
  const city = qs.get("city") === "0" ? "" : (me.location ?? "").trim();
  const handle = (me.handle ?? "").trim();

  const plan = planStory(
    byDay.map(({ day, items }) => ({
      day,
      items: items.map((c) => ({
        time: c.time,
        name: c.name,
        // Off keeps a busy week short, which is the whole reason the switch
        // exists; the tiers would have dropped them eventually anyway.
        where: showStudio ? c.where : "",
        who: c.who,
      })),
    })),
    listBudget(size * 0.98 * (line2 ? 2 : 1) + 78, !!city, format),
  );

  return renderStory({
    theme: t,
    format,
    kicker: shareKicker(from, days),
    line1,
    line2,
    headlineSize: size,
    city,
    photo: showPhoto ? me.photo : null,
    plan,
    empty: byDay.length === 0,
    emptyLine: "Nothing on the calendar for these days yet.",
    // A coach's picture sends people to a schedule; a member's asks them along.
    verb: kind === "coaching" ? "Full schedule at" : "Join me",
    url: handle ? `fittlist.co/${handle}` : "fittlist.co",
  });
}
