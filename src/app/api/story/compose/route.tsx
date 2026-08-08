import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { storyLook } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { headlineOf, renderStory } from "@/lib/storyimage";
import { typeFaceOf } from "@/lib/typefaces";
import { decoOf } from "@/lib/decorations";
import { listBudget, planStory, type StoryFormat } from "@/lib/storyplan";
import { shareRange, shareWeek } from "@/lib/shareweek";

// The composer's picture. One route for both hats and both canvases, because
// the composer is one screen: a second route per combination is four routes
// that have to agree about a headline.
//
// Everything is a query parameter and nothing is stored, so the preview redraws
// the moment a control moves and the thing that gets shared is the thing that
// was on screen. The one exception is the headline, which is also saved to the
// profile, because somebody's own words should survive closing the composer.

export const dynamic = "force-dynamic";

/** Never a blank field. It was a record keyed on the hat, back when a picture
 *  could be of the classes you were going to; there is one week to draw now. */
const FALLBACK: [string, string] = ["Come train", "with me."];

export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return new Response("Not found", { status: 404 });
  const qs = new URL(req.url).searchParams;

  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return new Response("Not found", { status: 404 });

  // A member has no week of their own to draw, so there is nothing here for
  // them: the composer is a coach's screen and this is the same wall.
  if (me.kind === "fan") return new Response("Not found", { status: 404 });
  // Style first, then one of the three colourways that style is offered in.
  // Colour belongs to the style rather than sitting beside it, so a diner
  // sign is never asked to wear Midnight.
  const [, y, t] = storyLook(qs.get("style"), qs.get("palette") ?? qs.get("theme"));
  const format: StoryFormat = qs.get("fmt") === "square" ? "square" : "story";
  const { from, days } = shareRange(qs.get("from"), qs.get("days"));
  const hide = new Set((qs.get("hide") ?? "").split(",").filter(Boolean));

  const byDay = await shareWeek(userId, from, days, hide);

  const prefs = me.storyPrefs ?? {};
  // The headline rides the URL so the preview redraws without a round trip;
  // the saved one is the fallback for anything that isn't the composer.
  const typed = qs.get("headline") ?? prefs.headline ?? "";
  const { line1, line2, size } = headlineOf(typed, FALLBACK);

  // An explicit param wins over the saved preference: the hub always asks
  // for the photo (photo=1, by Matt's call), and a coach who turned it off
  // in the old composer should not have that survive a screen that no
  // longer offers the switch.
  const photoParam = qs.get("photo");
  const showPhoto =
    (photoParam ? photoParam !== "0" : prefs.showPhoto !== false) && !!me.photo;
  const showStudio = qs.get("studios") !== "0";
  const city = qs.get("city") === "0" ? "" : (me.location ?? "").trim();
  const handle = (me.handle ?? "").trim();

  // Two scalers on the headline, multiplied. The slider's (hs, percent,
  // clamped to a range that can neither vanish nor swallow the poster) is
  // the writer's own loudness knob; the photo-off bump is the layout's.
  // The budget below reads the final size, or the extra height would come
  // out of the rows without the sums knowing.
  const hs = Math.max(60, Math.min(180, parseInt(qs.get("hs") ?? "100", 10) || 100)) / 100;
  const hSize = Math.round(size * hs * (showPhoto ? 1 : 1.16));

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
    listBudget(hSize * 0.98 * (line2 ? 2 : 1) + 78, !!city, format) / y.rowScale,
  );

  return renderStory({
    theme: t,
    style: y,
    format,
    line1,
    line2,
    headlineSize: hSize,
    city,
    photo: showPhoto ? me.photo : null,
    plan,
    empty: byDay.length === 0,
    emptyLine: "Nothing on the calendar for these days yet.",
    verb: "Full schedule at",
    url: handle ? `fittlist.co/${handle}` : "fittlist.co",
    // The headline's Font, picked by personality on the hub; the body
    // stays Delight.
    typeface: typeFaceOf(qs.get("type")),
    deco: decoOf(qs.get("deco")),
  });
}
