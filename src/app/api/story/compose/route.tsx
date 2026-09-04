import { eq, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { getDb, schema } from "@/db";
import { storyLook } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { renderStory } from "@/lib/storyimage";
import { buildShareStoryLayout } from "@/lib/share-story-layout";
import { typeFaceOf } from "@/lib/typefaces";
import { decoOf } from "@/lib/decorations";
import type { StoryFormat } from "@/lib/storyplan";
import { shareRange, shareWeek } from "@/lib/shareweek";
import {
  SHARE_HEADLINE_Y_MAX,
  SHARE_HEADLINE_Y_MIN,
  SHARE_SCHEDULE_Y_MAX,
  SHARE_SCHEDULE_Y_MIN,
} from "@/lib/share-design";

// The composer's picture. One route for both hats and both canvases, because
// the composer is one screen: a second route per combination is four routes
// that have to agree about a headline.
//
// Everything is a query parameter and nothing is stored. The live editor uses
// the same query values with its shared layout model, while this expensive
// 1080×1920 rasterization runs only for the frozen configuration passed by the
// final Share action.

export const dynamic = "force-dynamic";

const boundedNumber = (
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number => {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};

// A visual edit changes the final PNG but not the underlying week. Keep those
// DB reads warm for this content revision; a class/background mutation changes
// the revision and gets a fresh snapshot.
const composeUser = unstable_cache(
  async (userId: string, revision: string, includeBackground: boolean, includePhoto: boolean) => {
    void revision;
    const db = await getDb();
    const [user] = await db
      .select({
        kind: schema.users.kind,
        handle: schema.users.handle,
        headline: sql<string | null>`${schema.users.storyPrefs}->>'headline'`,
        showPhoto: sql<boolean | null>`(${schema.users.storyPrefs}->>'showPhoto')::boolean`,
        background: includeBackground
          ? sql<string | null>`${schema.users.storyPrefs}->>'background'`
          : sql<string | null>`null`,
        photo: includePhoto
          ? sql<string | null>`coalesce(${schema.users.photoThumb}, ${schema.users.photo})`
          : sql<string | null>`null`,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    return user ?? null;
  },
  ["story-compose-user"],
  { revalidate:300 },
);

const composeWeek = unstable_cache(
  async (userId: string, from: string, days: number, revision: string) => {
    void revision;
    return shareWeek(userId, from, days);
  },
  ["story-compose-week"],
  { revalidate:300 },
);

export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return new Response("Not found", { status: 404 });
  const qs = new URL(req.url).searchParams;
  // A style supplies a coordinated palette, typeface and decoration. Explicit
  // query parameters are editor overrides and win over those defaults.
  const [, y, t] = storyLook(qs.get("style"), qs.get("palette") ?? qs.get("theme"));
  const format: StoryFormat = qs.get("fmt") === "square" ? "square" : "story";
  const { from, days } = shareRange(qs.get("from"), qs.get("days"));
  const hide = new Set((qs.get("hide") ?? "").split(",").filter(Boolean));
  const revision = (qs.get("v") ?? "base").split("-")[0];
  const includeBackground = qs.get("bg") === "1";
  const photoParam = qs.get("photo");
  const includePhoto = photoParam ? photoParam !== "0" : true;
  const [me, completeWeek] = await Promise.all([
    composeUser(userId, revision, includeBackground, includePhoto),
    composeWeek(userId, from, days, revision),
  ]);
  if (!me) return new Response("Not found", { status: 404 });
  const byDay = completeWeek
    .map((day) => ({ ...day, items:day.items.filter((item) => !hide.has(item.key)) }))
    .filter((day) => day.items.length > 0);

  // A member's week draws here too now: the Share tab is theirs as well,
  // and `shareWeek` answers by kind, so the same route serves both.
  const fan = me.kind === "fan";

  const backgroundPhoto = includeBackground ? me.background : null;
  // No headline at all, by Matt's call: a switch in the Headline sheet, so
  // the picture can be the week alone. Distinct from an empty field, which
  // falls back, because a blank poster by accident is worse than either.
  const noHead = qs.get("nohead") === "1";
  // The headline rides the export URL so the frozen final image matches the
  // live DOM preview; the saved one is the fallback outside the editor.
  const typed = qs.get("headline") ?? me.headline ?? "";

  // An explicit param wins over the saved preference: the hub always asks
  // for the photo (photo=1, by Matt's call), and a coach who turned it off
  // in the old composer should not have that survive a screen that no
  // longer offers the switch.
  const showPhoto =
    (photoParam ? photoParam !== "0" : me.showPhoto !== false) && !!me.photo;
  const showStudio = qs.get("studios") !== "0";
  const handle = (me.handle ?? "").trim();
  const backgroundX = boundedNumber(qs.get("bx"), 50, 0, 100);
  const backgroundY = boundedNumber(qs.get("by"), 50, 0, 100);
  const backgroundZoom = boundedNumber(qs.get("bz"), 100, 100, 300);
  const backgroundOverlay = boundedNumber(qs.get("bo"), 24, 0, 60);
  const photoPanels = qs.get("panels") !== "0";
  const headlineY = boundedNumber(qs.get("hy"), 0, SHARE_HEADLINE_Y_MIN, SHARE_HEADLINE_Y_MAX);
  const scheduleY = boundedNumber(qs.get("sy"), 0, SHARE_SCHEDULE_Y_MIN, SHARE_SCHEDULE_Y_MAX);
  const featureKey = (qs.get("feature") ?? "").trim();
  const layout = buildShareStoryLayout({
    days:byDay,
    fan,
    headline:typed,
    noHead,
    headlinePercent:boundedNumber(qs.get("hs"), y.headlineSize, 60, 180),
    showPhoto,
    showStudio,
    featuredKey:featureKey || null,
    style:y,
    format,
  });

  return renderStory({
    theme: t,
    style: y,
    format,
    line1: layout.line1,
    line2: layout.line2,
    headlineSize: layout.headlineSize,
    photo: showPhoto ? me.photo : null,
    backgroundPhoto,
    backgroundX,
    backgroundY,
    backgroundZoom,
    backgroundOverlay,
    photoPanels,
    headlineY,
    scheduleY,
    feature:layout.feature,
    plan:layout.plan,
    narrativePlaces:layout.narrativePlaces,
    empty:layout.empty,
    emptyLine: fan
      ? "Nothing on the week yet."
      : "Nothing on the calendar for these days yet.",
    url: handle ? `fittlist.co/${handle}` : "fittlist.co",
    // The headline's Font, picked by personality on the hub; the body
    // stays Delight.
    typeface: typeFaceOf(qs.get("type") ?? y.typeface),
    deco: decoOf(qs.get("deco") ?? y.decoration),
    cacheControl: qs.has("v") ? "private, max-age=31536000, immutable" : "no-store",
  });
}
