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

/** Never a blank field. One week per kind: a coach's picture invites people
 *  to train with them, a member's invites people along. "Train with me.",
 *  by Matt's call: the longer "Come train with me." read as two asks. */
const FALLBACK: [string, string] = ["Train", "with me."];
const FALLBACK_FAN: [string, string] = ["Come", "with me."];

export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return new Response("Not found", { status: 404 });
  const qs = new URL(req.url).searchParams;

  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return new Response("Not found", { status: 404 });

  // A member's week draws here too now: the Share tab is theirs as well,
  // and `shareWeek` answers by kind, so the same route serves both.
  const fan = me.kind === "fan";
  // Style first, then one of the three colourways that style is offered in.
  // Colour belongs to the style rather than sitting beside it, so a diner
  // sign is never asked to wear Midnight.
  const [, y, t] = storyLook(qs.get("style"), qs.get("palette") ?? qs.get("theme"));
  const format: StoryFormat = qs.get("fmt") === "square" ? "square" : "story";
  const { from, days } = shareRange(qs.get("from"), qs.get("days"));
  const hide = new Set((qs.get("hide") ?? "").split(",").filter(Boolean));

  const byDay = await shareWeek(userId, from, days, hide);

  const prefs = me.storyPrefs ?? {};
  // No headline at all, by Matt's call: a switch in the Headline sheet, so
  // the picture can be the week alone. Distinct from an empty field, which
  // falls back, because a blank poster by accident is worse than either.
  const noHead = qs.get("nohead") === "1";
  // The headline rides the URL so the preview redraws without a round trip;
  // the saved one is the fallback for anything that isn't the composer.
  const typed = qs.get("headline") ?? prefs.headline ?? "";
  const { line1, line2, size } = headlineOf(typed, fan ? FALLBACK_FAN : FALLBACK);

  // An explicit param wins over the saved preference: the hub always asks
  // for the photo (photo=1, by Matt's call), and a coach who turned it off
  // in the old composer should not have that survive a screen that no
  // longer offers the switch.
  const photoParam = qs.get("photo");
  const showPhoto =
    (photoParam ? photoParam !== "0" : prefs.showPhoto !== false) && !!me.photo;
  const showStudio = qs.get("studios") !== "0";
  const handle = (me.handle ?? "").trim();

  // The slider's loudness knob, over a 1.4 baseline, by Matt's call: the
  // default poster wears what used to be 140%, and the slider moves
  // relative to that. The old photo-off auto-bump left with it (one knob,
  // not two fighting). The budget below reads the final size, or the
  // extra height would come out of the rows without the sums knowing.
  const hs = Math.max(60, Math.min(180, parseInt(qs.get("hs") ?? "100", 10) || 100)) / 100;
  const hSize = Math.round(size * hs * 1.4);
  // What the top of the canvas costs. Without a headline the rows take the
  // room, except the face still needs clearing when it is on: the paint
  // draws the matching spacer, and 246 stays ahead of the photo's height on
  // either canvas so the sums never trail the paint.
  const headH = noHead
    ? showPhoto
      ? 246
      : 0
    : hSize * 0.98 * (line2 ? 2 : 1) + 78;

  // "Coaching" on the image, per the brief: tag only the classes you are
  // coaching and leave the rest bare. Only when the picture actually mixes
  // the two hats, though: a poster that is all teaching rows (the classic
  // coach picture) saying Coaching on every line is the tag saying nothing.
  const flat = byDay.flatMap((d) => d.items);
  const mixed = flat.some((c) => c.coaching) && flat.some((c) => !c.coaching);
  const plan = planStory(
    byDay.map(({ day, items }) => ({
      day,
      items: items.map((c) => ({
        time: c.time,
        name: c.name,
        // Off keeps a busy week short, which is the whole reason the switch
        // exists; the tiers would have dropped them eventually anyway.
        where: showStudio ? c.where : "",
        who: mixed && c.coaching ? "Coaching" : c.who,
      })),
    })),
    listBudget(headH, format) / y.rowScale,
  );

  return renderStory({
    theme: t,
    style: y,
    format,
    line1: noHead ? "" : line1,
    line2: noHead ? "" : line2,
    headlineSize: hSize,
    photo: showPhoto ? me.photo : null,
    plan,
    empty: byDay.length === 0,
    emptyLine: fan
      ? "Nothing on the week yet."
      : "Nothing on the calendar for these days yet.",
    url: handle ? `fittlist.co/${handle}` : "fittlist.co",
    // The headline's Font, picked by personality on the hub; the body
    // stays Delight.
    typeface: typeFaceOf(qs.get("type")),
    deco: decoOf(qs.get("deco")),
  });
}
