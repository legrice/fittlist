// One layout brain for both story images.
//
// The canvas is a fixed 1080x1920 with no scroll and no reflow, so a busy week
// used to run straight off the bottom: rows rendered until the space ran out
// and the footer landed on top of whatever was left. Eight classes was already
// enough to clip a real coach's poster; twenty dropped twelve of them and said
// nothing.
//
// The fix isn't a cap on how much a coach may teach. It's to stop the poster
// repeating itself, and then to summarise rather than to truncate. Three levels
// of detail, in order, and the first one that fits wins:
//
//   1. as it always was: a row per class, the place under the name
//   2. the same shape, tighter, with a place they all share lifted out of every
//      row and printed once
//   3. one line per day: names and their times run together, places lifted
//
// Only past the third does anything get dropped, and then the poster says how
// much. The image is an advertisement for the link rather than a copy of the
// schedule, so "23 classes, here's the shape of the week" is a fair thing for
// it to say; quietly losing Monday is not.

export type StoryItem = {
  /** Already formatted for the eye, e.g. "6:30a". */
  time: string;
  name: string;
  /** The studio or place. "" when there isn't one. */
  where: string;
  /** A coach's first name, on a member's poster. */
  who?: string;
};

export type StoryDay = { day: string; items: StoryItem[] };

/** A class as one row: the time in its column, the name, and a line under it. */
export type PlanRow = { time: string; name: string; sub: string };
/** A day as one line: each name with the times it runs at. */
export type PlanEntry = { name: string; times: string };

export type StoryPlan = {
  tier: 1 | 2 | 3;
  /** Tiers 1 and 2. Empty at tier 3. */
  days: { day: string; rows: PlanRow[] }[];
  /** Tier 3 only. */
  summary: { day: string; entries: PlanEntry[] }[];
  /** Tier 3 only: the biggest type the week could be said in. */
  summaryFs: number;
  /** What every class has in common, printed once under the headline. */
  lifted: string | null;
  /** Days that didn't fit even summarised. */
  moreDays: number;
};

// The heights the renderers actually produce. They live next to the tiers
// because the two have to agree: Satori can't measure, so the only way to know
// something fits is to have counted it the same way it will be drawn.
// Names run two pixels bigger (50/44) and truncate to one line now, so a
// row's height is exact rather than hopeful: a wrapping name used to draw
// taller than anything here counted.
const T1 = { day: 92, row: 128, rowBare: 79 };
const T2 = { day: 75, row: 111, rowBare: 68 };
// At tier 3 each distinct class gets its own line: the name, then every time
// it runs that day. Running them all onto one wrapped line was denser on paper
// but not in fact, because an entry can't break in the middle, so a "line"
// held one entry anyway and only the maths thought otherwise. Stacked, the
// height is countable: a line per entry, plus a line for any name too long to
// sit on one. The week is then said in the biggest size that fits.
const T3_SIZES = [46, 40, 34];
const T3_GAP = 26;
/** Delight averages a shade over half its size per character. */
const t3Chars = (fs: number, width: number) => Math.max(12, Math.floor(width / (fs * 0.52)));
/** The lifted line, plus the air under it. */
const LIFTED_H = 73;
/** The "+ 3 more days" line. */
const MORE_H = 52;

/** The two canvases. A story is what gets posted to Stories; a square is what
 *  gets pasted into a group chat and posted to feed, and it is the shorter of
 *  the two by a long way, so the same week has to summarise sooner on it. */
export type StoryFormat = "story" | "square";
const CANVAS_H = 1920;
const SQUARE_H = 1080;
/** A square has no reply bar over it, so its margins are ordinary margins. */
const SQ_PAD_TOP = 92;
const SQ_PAD_BOTTOM = 92;
/**
 * The margins, and they are ordinary margins again.
 *
 * They were 240 and 280 for a while, held apart to clear Instagram's profile
 * row at the top and its reply bar at the bottom, on the argument that the
 * lockup is the acquisition channel and the last thing that should be covered.
 * Matt's call is that the picture has to be worth looking at first: at those
 * numbers a light week read as a band of content floating in a lot of nothing,
 * and the composer's preview shows the whole canvas, so the empty space is what
 * somebody sees while deciding whether to post at all.
 *
 * The cost is real and worth writing down rather than discovering: posted to
 * Stories, the footer now sits inside the reply bar's zone and can be partly
 * covered. Raising `PAD_BOTTOM` is the one-line way back, and the sums follow
 * it because `listBudget` and `storyPadding` both read from here.
 */
const PAD_TOP = 104;
const PAD_BOTTOM = 104;
/** The url and the lockup along the bottom. */
const FOOTER_H = 76;
/** "See my schedule at", the small line above the url. The URL rode under
 *  the headline for a build and went back down, by Matt's call, so the
 *  footer is two lines again and nothing sits under the headline. */
const VERB_H = 46;

/**
 * How much room the list gets, once the furniture has taken its share. The
 * headline is the one part that changes size with the coach's own words, so
 * the caller measures that and passes it in.
 */
export function listBudget(headlineHeight: number, format: StoryFormat = "story"): number {
  const [h, top, bottom] =
    format === "square" ? [SQUARE_H, SQ_PAD_TOP, SQ_PAD_BOTTOM] : [CANVAS_H, PAD_TOP, PAD_BOTTOM];
  // The kicker's 71px came off with the kicker itself: the day headings
  // carry their dates now, and the freed room goes to the rows.
  return h - top - bottom - headlineHeight - FOOTER_H - VERB_H;
}

/** The padding the canvas is drawn with, so the route and the sums can't
 *  disagree about the safe area. */
export function storyPadding(format: StoryFormat): { top: number; bottom: number; side: number } {
  return format === "square"
    ? { top: SQ_PAD_TOP, bottom: SQ_PAD_BOTTOM, side: 86 }
    : { top: PAD_TOP, bottom: PAD_BOTTOM, side: 86 };
}

/**
 * How tall a plan draws. The whole failure was the sums disagreeing with the
 * paint, so the sums are a function anything can check rather than a comment
 * nobody reads. `scripts/storyplan-check.mjs` holds it to the budget.
 */
export function measurePlan(plan: StoryPlan, summaryWidth = 764): number {
  const lifted = plan.lifted ? LIFTED_H : 0;
  if (plan.tier === 3)
    return (
      lifted +
      plan.summary.reduce((n, d) => n + summaryHeight(d.entries, plan.summaryFs, summaryWidth), 0) +
      (plan.moreDays > 0 ? MORE_H : 0)
    );
  const m = plan.tier === 1 ? T1 : T2;
  return (
    lifted +
    plan.days.reduce(
      (n, d) => n + m.day + d.rows.reduce((r, row) => r + (row.sub ? m.row : m.rowBare), 0),
      0,
    )
  );
}

/** "A", "A and B", "A, B and C". A list a person would say out loud. */
function spoken(list: string[]): string {
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** The sub-line under a class name: who's teaching it, where it is, or both. */
function subLine(item: StoryItem, showPlace: boolean): string {
  return [item.who, showPlace ? item.where : ""].filter(Boolean).join(" · ");
}

function toRows(days: StoryDay[], showPlace: boolean) {
  return days.map((d) => ({
    day: d.day,
    rows: d.items.map((i) => ({ time: i.time, name: i.name, sub: subLine(i, showPlace) })),
  }));
}

function heightOf(days: StoryDay[], showPlace: boolean, m: typeof T1) {
  return days.reduce(
    (n, d) =>
      n +
      m.day +
      d.items.reduce((r, i) => r + (subLine(i, showPlace) ? m.row : m.rowBare), 0),
    0,
  );
}

/** The same class twice in a day is one entry with two times on it. */
function entriesFor(items: StoryItem[]): PlanEntry[] {
  const order: string[] = [];
  const times = new Map<string, string[]>();
  for (const i of items) {
    if (!times.has(i.name)) {
      order.push(i.name);
      times.set(i.name, []);
    }
    times.get(i.name)!.push(i.time);
  }
  return order.map((name) => ({ name, times: times.get(name)!.join(", ") }));
}

function summaryHeight(entries: PlanEntry[], fs: number, width: number): number {
  const per = t3Chars(fs, width);
  const lines = entries.reduce(
    (n, e) => n + Math.max(1, Math.ceil((e.name.length + e.times.length + 2) / per)),
    0,
  );
  return lines * Math.round(fs * 1.3) + T3_GAP;
}

/**
 * Pick the most detailed layout that fits in `budget` pixels of list space.
 * `summaryWidth` is how wide the per-day lines get to be at tier 3.
 */
export function planStory(days: StoryDay[], budget: number, summaryWidth = 764): StoryPlan {
  const all = days.flatMap((d) => d.items);
  const places = [...new Set(all.map((i) => i.where).filter(Boolean))];
  const people = [...new Set(all.map((i) => i.who).filter(Boolean))] as string[];
  const onePlace = places.length === 1 ? places[0] : null;

  // 1. Everything, as the poster has always drawn it.
  if (heightOf(days, true, T1) <= budget)
    return { tier: 1, days: toRows(days, true), summary: [], summaryFs: 0, lifted: null, moreDays: 0 };

  // 2. The same rows, tighter, and if every class is at the same place then
  //    that place stops being eight identical grey lines and becomes one.
  const showPlace = !onePlace;
  const lifted = onePlace ? `All at ${onePlace}` : null;
  if (heightOf(days, showPlace, T2) + (lifted ? LIFTED_H : 0) <= budget)
    return {
      tier: 2,
      days: toRows(days, showPlace),
      summary: [],
      summaryFs: 0,
      lifted,
      moreDays: 0,
    };

  // 3. A line a day. Where it is moves to the top when there are few enough
  //    places to name; past that the link carries it, which is the link's job.
  const summary = days.map((d) => ({ day: d.day, entries: entriesFor(d.items) }));
  const t3Lifted =
    places.length > 0 && places.length <= 3
      ? `${places.length === 1 ? "All at" : "At"} ${spoken(places)}`
      : people.length > 0 && people.length <= 3
        ? `With ${spoken(people)}`
        : null;

  const room = budget - (t3Lifted ? LIFTED_H : 0);
  // The biggest type the whole week fits in. A busy coach's poster should fill
  // the paper rather than trail off two thirds of the way down it.
  for (const fs of T3_SIZES) {
    const h = summary.reduce((n, d) => n + summaryHeight(d.entries, fs, summaryWidth), 0);
    if (h <= room)
      return { tier: 3, days: [], summary, summaryFs: fs, lifted: t3Lifted, moreDays: 0 };
  }

  // Past even that, days come off the end and the poster says how many.
  const fs = T3_SIZES[T3_SIZES.length - 1];
  let left = room - MORE_H;
  const kept: typeof summary = [];
  for (const d of summary) {
    const h = summaryHeight(d.entries, fs, summaryWidth);
    if (left - h < 0) break;
    left -= h;
    kept.push(d);
  }
  return {
    tier: 3,
    days: [],
    summary: kept,
    summaryFs: fs,
    lifted: t3Lifted,
    moreDays: summary.length - kept.length,
  };
}
