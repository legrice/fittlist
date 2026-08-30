import type { StoryStyle } from "@/lib/format";
import {
  listBudget,
  planStory,
  storyFeatureBudget,
  type StoryFeature,
  type StoryFormat,
  type StoryPlan,
} from "@/lib/storyplan";

export type ShareStoryLayoutItem = {
  key: string;
  time: string;
  name: string;
  where: string;
  who: string;
  coaching?: boolean;
};

export type ShareStoryLayoutDay = {
  day: string;
  items: ShareStoryLayoutItem[];
};

export type ShareStoryLayout = {
  line1: string;
  line2: string;
  headlineSize: number;
  feature: StoryFeature | null;
  plan: StoryPlan;
  empty: boolean;
  mixed: boolean;
};

/**
 * Split and size the poster headline. This lives in the client-safe layout
 * module so the DOM preview and final ImageResponse cannot disagree about
 * where the line breaks or how much schedule space the words consume.
 */
export function storyHeadline(text: string, fallback: [string, string]) {
  let line1 = fallback[0];
  let line2 = fallback[1];
  const clean = text.trim();
  if (clean) {
    const words = clean.split(/\s+/);
    const cut = Math.ceil(words.length / 2);
    line1 = words.slice(0, cut).join(" ");
    line2 = words.slice(cut).join(" ");
  }
  const longest = Math.max(line1.length, line2.length);
  const size = longest <= 9 ? 104 : longest <= 13 ? 86 : longest <= 18 ? 70 : 58;
  return { line1, line2, size };
}

/**
 * The shared layout brain for the live DOM poster and the exported PNG.
 * Source loading stays outside this function; editing only changes this small
 * deterministic model and never needs a database or image render.
 */
export function buildShareStoryLayout({
  days,
  fan,
  headline,
  noHead,
  headlinePercent,
  showPhoto,
  showStudio,
  featuredKey,
  style,
  format = "story",
}: {
  days: ShareStoryLayoutDay[];
  fan: boolean;
  headline: string;
  noHead: boolean;
  headlinePercent: number;
  showPhoto: boolean;
  showStudio: boolean;
  featuredKey: string | null;
  style: StoryStyle;
  format?: StoryFormat;
}): ShareStoryLayout {
  const fallback: [string, string] = fan ? ["Come", "with me."] : ["Train", "with me."];
  const split = storyHeadline(headline, fallback);
  const headlineScale = Math.max(60, Math.min(180, headlinePercent)) / 100;
  const headlineSize = Math.round(split.size * headlineScale * 1.4);
  const line1 = noHead ? "" : split.line1;
  const line2 = noHead ? "" : split.line2;
  const headlineHeight = noHead
    ? showPhoto
      ? 246
      : 0
    : headlineSize * 0.98 * (split.line2 ? 2 : 1) + 78;

  const flat = days.flatMap((day) => day.items);
  const mixed = flat.some((item) => item.coaching) && flat.some((item) => !item.coaching);
  const featured = featuredKey
    ? days
        .flatMap(({ day, items }) => items.map((item) => ({ day, item })))
        .find(({ item }) => item.key === featuredKey)
    : undefined;
  const feature = featured
    ? {
        day: featured.day,
        time: featured.item.time,
        name: featured.item.name,
        sub: [
          mixed && featured.item.coaching ? "Coaching" : featured.item.who,
          showStudio ? featured.item.where : "",
        ]
          .filter(Boolean)
          .join(" · "),
      }
    : null;
  const regularDays = days
    .map((day) => ({
      ...day,
      items: featured ? day.items.filter((item) => item.key !== featured.item.key) : day.items,
    }))
    .filter((day) => day.items.length > 0);
  const scheduleBudget = Math.max(
    0,
    listBudget(headlineHeight, format) - (feature ? storyFeatureBudget(format) : 0),
  );
  const plan = planStory(
    regularDays.map(({ day, items }) => ({
      day,
      items: items.map((item) => ({
        time: item.time,
        name: item.name,
        where: showStudio ? item.where : "",
        who: mixed && item.coaching ? "Coaching" : item.who,
      })),
    })),
    scheduleBudget / style.rowScale,
    764,
    { keepPlacesWithClasses: !!feature || flat.some((item) => item.coaching) },
  );

  return {
    line1,
    line2,
    headlineSize,
    feature,
    plan,
    empty: days.length === 0,
    mixed,
  };
}
