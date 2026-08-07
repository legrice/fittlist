// Shared display logic - mirrors the prototype's helpers exactly.

export const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
export type DayName = (typeof DAYS)[number];

export const TIME_PRESETS = ["06:00", "09:00", "12:00", "17:30", "18:30"];
export const DUR_PRESETS = [30, 45, 50, 60, 75];
export const LINK_LABELS = ["Website", "Mindbody", "ClassPass", "Other"];

// Booking/profile providers we recognise from a pasted URL, so the coach never
// has to pick a label. Order matters only for readability; matching is by
// hostname substring. Anything unrecognised falls back to "Website".
const PROVIDER_DOMAINS: [string, string][] = [
  ["mindbodyonline.com", "Mindbody"],
  ["mindbody", "Mindbody"],
  ["classpass.com", "ClassPass"],
  ["wellnessliving.com", "WellnessLiving"],
  ["glofox.com", "Glofox"],
  ["punchpass.com", "Punchpass"],
  ["momence.com", "Momence"],
  ["acuityscheduling.com", "Acuity"],
  ["calendly.com", "Calendly"],
  ["eventbrite.", "Eventbrite"],
  ["wodify.com", "Wodify"],
  ["walla.app", "Walla"],
  ["sessionsapp.com", "Sessions"],
  ["trainerize.com", "Trainerize"],
  ["squareup.com", "Square"],
  ["square.site", "Square"],
  ["instagram.com", "Instagram"],
  ["facebook.com", "Facebook"],
  ["fb.com", "Facebook"],
  ["linktr.ee", "Linktree"],
  ["youtube.com", "YouTube"],
  ["tiktok.com", "TikTok"],
];

export function detectProvider(rawUrl: string): string {
  const url = rawUrl.trim();
  if (!url) return "Website";
  let host = url.toLowerCase();
  try {
    host = new URL(url.includes("://") ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    /* not a parseable URL yet (still typing); fall back to substring match */
  }
  for (const [domain, label] of PROVIDER_DOMAINS) {
    if (host.includes(domain)) return label;
  }
  return "Website";
}

/**
 * What a class is, from the one vocabulary.
 *
 * This was its own shorter list (thirteen words) while a studio's types and a
 * coach's disciplines both came from `STUDIO_TYPES`, and the split quietly
 * broke the rule the rest of the directory is built on: one word has to mean
 * the same thing everywhere. "Kettlebell" found the kettlebell gyms and the
 * kettlebell coaches and could not be put on a kettlebell class at all,
 * because the class picker had never heard of it. Discover's chips were built
 * from two vocabularies for the same idea, so a word that narrowed one half
 * could not narrow another.
 *
 * It is the same list now. The alias stays because the name reads right at
 * the call site: a class picks what it is, a studio picks what it offers, and
 * they are the same set of words.
 */
export { STUDIO_TYPES as CLASS_TYPES } from "@/lib/studio";
export type ClassType = string;

// Studio colors cycle by directory index (studios.seq), deterministic.
export const PALETTES = [
  { rail: "#92A6A7", bg: "#E4EAEA", tx: "#4C6768" }, // sky
  { rail: "#CBD665", bg: "#EEF2D2", tx: "#6A7226" }, // tacha
  { rail: "#C4B98E", bg: "#EFEBD8", tx: "#6E6547" }, // sand
  { rail: "#4E4B3B", bg: "#E6E3D6", tx: "#4E4B3B" }, // olive
];

export function palForSeq(seq: number) {
  return PALETTES[Math.max(0, seq - 1) % PALETTES.length];
}

export type AppTheme = "classic" | "blocks" | "poster";
export function appTheme(v: string | null | undefined): AppTheme {
  return v === "blocks" ? "blocks" : v === "poster" ? "poster" : "classic";
}

// "Blocks" look: vivid full-bleed color fields, one per studio (deterministic
// by directory index). fg is the readable text color on each fill.
export const BLOCKS_FILLS = [
  { bg: "#8FE0C8", fg: "#191502" }, // mint
  { bg: "#F5D34A", fg: "#191502" }, // butter
  { bg: "#DD583A", fg: "#F7F2E8" }, // sienna
  { bg: "#A9D8DA", fg: "#191502" }, // sky
];
export function blocksFill(seq: number) {
  return BLOCKS_FILLS[Math.max(0, seq - 1) % BLOCKS_FILLS.length];
}

/**
 * The colourways a poster comes in. Sixteen, and colour is the whole of the
 * choice again.
 *
 * There was a second axis for a while, ten arrangements the picture could be
 * drawn in, and it came out: even spread hard apart they were not different
 * enough to be worth a decision, and the picker cost a sheet and a grid to
 * offer a difference nobody could see. Colour is the thing that actually makes
 * two posters look like two posters, so there are twice as many of them now
 * and nothing else to pick.
 *
 * Every one is built the same way and has to answer the same four questions,
 * or it will look right in the swatch and wrong in the poster: the ground, the
 * ink on it, an accent with enough contrast to carry the headline and the
 * times, and a faint tone for the day labels that is still readable. `lockup`
 * says which of the two wordmarks sits on it, and `lockupAccent` swaps the
 * mark's sienna row when sienna would vanish into the ground.
 */
export type StoryThemeId =
  | "iron"
  | "paper"
  | "moss"
  | "pop"
  | "midnight"
  | "sunset"
  | "blush"
  | "slate"
  | "citrus"
  | "forest"
  | "cobalt"
  | "mono"
  | "sand"
  | "plum"
  | "surf"
  | "ember";
export type StoryTheme = {
  label: string;
  bg: string;
  fg: string;
  accent: string;
  muted: string; // kicker
  faint: string; // day labels, studio names
  time: string; // times column
  lockup: "cloud" | "ink";
  lockupAccent?: string; // swap the lockup's Sienna row when it would vanish on bg
};
export const STORY_THEMES: Record<StoryThemeId, StoryTheme> = {
  // The first colourway wears the site's own gradient, by Matt's call: the
  // warm top fading into the cool gray, so the default poster and the app
  // it came from are one thing.
  paper: { label: "Cream", bg: "linear-gradient(180deg, #f7cda6 0%, #f3e0c9 38%, #eef0f1 78%)", fg: "#191502", accent: "#C2410C", muted: "#6b6555", faint: "#8a8570", time: "#3a3526", lockup: "ink" },
  iron: { label: "Ink", bg: "#191502", fg: "#f4efe1", accent: "#C2410C", muted: "#c9c3ae", faint: "#8a8570", time: "#dad4be", lockup: "cloud" },
  moss: { label: "Moss", bg: "#4E4B3B", fg: "#F7F2E8", accent: "#CBD665", muted: "#C9C3AE", faint: "#A8A48E", time: "#E6E3D6", lockup: "cloud" },
  pop: { label: "Pop", bg: "#C2410C", fg: "#f4efe1", accent: "#191502", muted: "#f9e4dd", faint: "#f2c1b2", time: "#fff2ea", lockup: "cloud", lockupAccent: "#191502" },
  midnight: { label: "Midnight", bg: "#161e33", fg: "#f2efe4", accent: "#e5b558", muted: "#9aa3ba", faint: "#77809a", time: "#d5d9e6", lockup: "cloud", lockupAccent: "#e5b558" },
  sunset: { label: "Sunset", bg: "linear-gradient(170deg, #3b1c53 0%, #8f3a5f 55%, #d96b4a 100%)", fg: "#fdf3e6", accent: "#ffc46b", muted: "#e5c3bc", faint: "#d3a9a6", time: "#ffe6cf", lockup: "cloud", lockupAccent: "#ffc46b" },
  blush: { label: "Blush", bg: "#f7dde2", fg: "#3d1b25", accent: "#c2385e", muted: "#8f6470", faint: "#b18f98", time: "#5c333f", lockup: "ink", lockupAccent: "#c2385e" },
  slate: { label: "Slate", bg: "#2b2e33", fg: "#eef0ee", accent: "#c9e265", muted: "#a3a8ad", faint: "#7f858c", time: "#d8dcd8", lockup: "cloud", lockupAccent: "#c9e265" },
  // The eight added when the style axis came out. Four grounds that are new
  // families rather than shades of the eight above (a yellow, a deep green, a
  // blue, a true black and white), and four that are the quiet end, because
  // the quiet ones are what most people settle on and there was only one.
  citrus: { label: "Citrus", bg: "#f2c14e", fg: "#241d05", accent: "#7a2e0e", muted: "#6d5a24", faint: "#8a7333", time: "#3a2f0c", lockup: "ink", lockupAccent: "#7a2e0e" },
  forest: { label: "Forest", bg: "#14312a", fg: "#eaf3ec", accent: "#8fd6a8", muted: "#9db8a9", faint: "#7d9a8c", time: "#d3e6d8", lockup: "cloud", lockupAccent: "#8fd6a8" },
  cobalt: { label: "Cobalt", bg: "#2438d6", fg: "#f2f3ff", accent: "#ffd447", muted: "#b3bbf5", faint: "#96a0ee", time: "#e2e5ff", lockup: "cloud", lockupAccent: "#ffd447" },
  mono: { label: "Mono", bg: "#0d0d0d", fg: "#fafafa", accent: "#fafafa", muted: "#9a9a9a", faint: "#7a7a7a", time: "#e4e4e4", lockup: "cloud", lockupAccent: "#fafafa" },
  sand: { label: "Sand", bg: "#e3d7c2", fg: "#2b2413", accent: "#a1522b", muted: "#6f6350", faint: "#8b7d67", time: "#3f3524", lockup: "ink", lockupAccent: "#a1522b" },
  plum: { label: "Plum", bg: "#3b1c3f", fg: "#f6ecf5", accent: "#f0a3c8", muted: "#b79ab6", faint: "#9a7d9a", time: "#e6d6e5", lockup: "cloud", lockupAccent: "#f0a3c8" },
  surf: { label: "Surf", bg: "#cfe9e4", fg: "#10322e", accent: "#0f6b5c", muted: "#5c7f7a", faint: "#7c9b96", time: "#1d423d", lockup: "ink", lockupAccent: "#0f6b5c" },
  ember: { label: "Ember", bg: "linear-gradient(165deg, #1a1005 0%, #6b2a0f 60%, #c2410c 100%)", fg: "#fdeee2", accent: "#ffb066", muted: "#d9b49c", faint: "#bd9a80", time: "#ffe0c6", lockup: "cloud", lockupAccent: "#ffb066" },
};
/**
 * How the picture is drawn, as opposed to what colour it is.
 *
 * There were ten of these, and there is one. The ten were an attempt at "more
 * fun ways to share": a poster arrangement, a stacked one, a ticket, a
 * marquee, and so on, each a different point in a small vocabulary of
 * alignment, case, rules, chips and where the time sits. They were spread as
 * hard apart as the vocabulary allowed and they still were not different
 * enough to be worth a decision, which is the honest verdict on them: the
 * picker cost a sheet, a grid and ten miniatures to offer a difference nobody
 * could see. What actually makes two posters look like two posters is colour,
 * so there are sixteen colourways now and no second question.
 *
 * The shape stays because the paint reads it: `renderStory` takes a
 * `StoryStyle` and honours every knob on it, and `check:story` divides its
 * budget by `rowScale`. Reducing this to one entry deletes nine styles without
 * touching the renderer, and is what a style axis coming back would be built
 * on. Nothing in the app offers a choice of one.
 */
export type StoryStyleId = "plain";

export type StoryStyle = {
  label: string;
  /** Multiplies the headline. */
  headline: number;
  /** Multiplies the class name on each row. */
  name: number;
  /** UPPERCASE the class names. */
  upper: boolean;
  /** Where the block sits, and where each row reads from. */
  align: "left" | "center";
  /** A line under each row: none, a hairline, or a full rule. */
  rule: "none" | "hair" | "bold";
  /** A filled block behind each row, in the theme's own faint tone. */
  chip: boolean;
  /** Corner radius on that block. */
  radius: number;
  /** The time on its own line under the name rather than out to the right. */
  stackTime: boolean;
  /** Letter-spacing on the day label, in em. */
  dayTrack: number;
  /**
   * How much taller a row draws than the plain one, as a multiplier.
   *
   * This is the contract that keeps a style from clipping the canvas.
   * `planStory` fits a week to a fixed budget using one set of constants, and
   * `check:story` holds 6,000 synthetic weeks to it; a style that quietly grew
   * its rows would pass the planner and overflow the paint, which is the exact
   * failure the planner exists to prevent. Rather than teach the planner every
   * style, the routes divide the budget by this. Err high: a style that draws
   * shorter than it claims wastes a little canvas, one that draws taller loses
   * somebody's Thursday.
   */
  rowScale: number;
};

export const STORY_STYLES: Record<StoryStyleId, StoryStyle> = {
  plain: { label: "Plain", headline: 1.0, name: 1.0, upper: false, align: "left", rule: "none", chip: false, radius: 0, stackTime: false, dayTrack: 0.12, rowScale: 1.0 },
};

/**
 * The one style, and a colourway, from whatever the URL said.
 *
 * Self-healing on purpose: an unknown colour falls back to Cream rather than
 * erroring or drawing something with no ink on it. `?theme=` and `?palette=`
 * both land here, by id and by label, because both are out in the world: the
 * composer sent labels while colour belonged to a style, and every link before
 * that sent ids.
 */
export function storyLook(
  styleId: string | null,
  paletteId: string | null,
): [StoryStyleId, StoryStyle, StoryTheme] {
  void styleId;
  const want = (paletteId ?? "").toLowerCase();
  const byId = (Object.keys(STORY_THEMES) as StoryThemeId[]).find((k) => k.toLowerCase() === want);
  const byLabel = (Object.keys(STORY_THEMES) as StoryThemeId[]).find(
    (k) => STORY_THEMES[k].label.toLowerCase() === want,
  );
  return ["plain", STORY_STYLES.plain, STORY_THEMES[byId ?? byLabel ?? "paper"]];
}

export function storyTheme(id: string | null): [StoryThemeId, StoryTheme] {
  const key = (id && id in STORY_THEMES ? id : "paper") as StoryThemeId;
  return [key, STORY_THEMES[key]];
}

/** "17:30" -> "5:30p" */
export function fmtTime(v: string): string {
  const [hRaw, m] = v.split(":").map(Number);
  const ap = hRaw >= 12 ? "p" : "a";
  const h = hRaw % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")}${ap}`;
}

/** "17:00" -> { hm: "5:00", ap: "PM" } for the agenda's stacked clock. */
export function clockParts(v: string): { hm: string; ap: string } {
  const [hRaw, m] = v.split(":").map(Number);
  const ap = hRaw >= 12 ? "PM" : "AM";
  const h = hRaw % 12 || 12;
  return { hm: `${h}:${String(m).padStart(2, "0")}`, ap };
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "") || "you";
}

export function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_ORIGIN || "https://fittlist.co";
}

/** Does this class run on the given date? One-offs land on their own date; a
 *  standing weekly runs on its weekday until endsOn (inclusive), forever if
 *  that's null, minus any single dates cancelled out of it. ISO dates compare
 *  correctly as strings.
 *
 *  Every screen that expands a recurrence goes through here — schedule, public
 *  page, feed, digest, discover, .ics — so a skipped date disappears from all
 *  of them at once. That's the whole reason skip_dates lives on the row. */
export function runsOn(
  c: {
    specificDate: string | null;
    dayOfWeek: number;
    endsOn?: string | null;
    skipDates?: string[] | null;
  },
  iso: string,
  dow: number,
): boolean {
  if (c.specificDate) return c.specificDate === iso;
  if (c.endsOn && iso > c.endsOn) return false;
  if (c.dayOfWeek !== dow) return false;
  return !c.skipDates?.includes(iso);
}

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** [0, 2, 4] -> "Mon, Wed & Fri" */
export function fmtDays(days: number[]): string {
  const names = [...days].sort((a, b) => a - b).map((d) => DAY_SHORT[d]);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

// The app's clock. Classes store floating local times ("06:00", no zone), and
// every screen agrees on what "today" means by asking here. It used to be the
// server's day, which on Vercel is UTC: from 8pm Eastern the whole app lived a
// day ahead, showing Thursday as today on Wednesday night. Everyone in the
// beta trains in US Eastern, so that's the clock, overridable per deployment.
// A timezone per coach (or per viewer) is the real fix, and it would land in
// these three functions.
const APP_TZ = process.env.NEXT_PUBLIC_APP_TZ || "America/New_York";

/** The app's timezone, for anything that writes a wall-clock time somewhere
 *  else (the Google Calendar sync): a class's "6:00" means 6:00 here. */
export function appTz(): string {
  return APP_TZ;
}

/** How far back the calendars scroll: eight weeks of what has been. One
 *  number, shared by the loader that fetches the window and the screens
 *  that reveal it, so the scroll can't outrun the data. */
export const CAL_PAST_DAYS = 56;

/** "Today", "Tomorrow", then the ordinary day header: the two days you
 *  stand closest to read better as words than dates. One helper so
 *  Following and the calendars can't disagree on where words end.
 *
 *  The relative word no longer replaces the date, it leads it: "Today" alone
 *  made somebody work out which date they were looking at, and every other
 *  heading in the app was already saying one. `dayBandLabel` is the single
 *  answer, so a heading and a band can't word the same day differently. */
export function fmtDayHeaderRel(iso: string, today = todayIso()): string {
  return dayBandLabel(iso, today);
}

/** ISO date (YYYY-MM-DD) of this instant in the app's timezone. Where "from
 *  now on" starts. Pass a Date to ask what day some other instant falls on. */
export function todayIso(now = new Date()): string {
  // en-CA is the locale whose short date is already YYYY-MM-DD.
  return now.toLocaleDateString("en-CA", { timeZone: APP_TZ });
}

/** Minutes past midnight of this instant, in the app's timezone. */
function minutesNow(now = new Date()): number {
  const [h, m] = now
    .toLocaleTimeString("en-GB", { timeZone: APP_TZ, hour12: false, hour: "2-digit", minute: "2-digit" })
    .split(":")
    .map(Number);
  // en-GB says "24:00" for midnight in some ICU versions; fold it back.
  return ((h % 24) * 60 + m);
}

/**
 * Has this occurrence been and gone?
 *
 * Times are floating, so both sides land on the same floating scale: the
 * occurrence's end as its date plus minutes, the present as today's date plus
 * minutes, both in the app's timezone. A class only counts as gone once its
 * end time has passed, not at midnight.
 */
export function occurrenceEnded(iso: string, startTime: string, durationMin: number): boolean {
  const [h, m] = startTime.split(":").map(Number);
  const end = new Date(`${iso}T00:00:00Z`);
  end.setUTCMinutes(end.getUTCMinutes() + h * 60 + m + durationMin);
  const now = new Date();
  const ref = new Date(`${todayIso(now)}T00:00:00Z`);
  ref.setUTCMinutes(ref.getUTCMinutes() + minutesNow(now));
  return end.getTime() < ref.getTime();
}

/** ISO date (YYYY-MM-DD) of the current week's Monday, in the app's timezone. */
export function mondayOfCurrentWeek(now = new Date()): string {
  const m = new Date(`${todayIso(now)}T00:00:00Z`);
  m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7));
  return m.toISOString().slice(0, 10);
}

/**
 * The three weeks the app flips through, Sunday to Saturday.
 *
 * Both Calendar and Following are a week at a time with an arrow either side,
 * and this is where "which week" is decided so the two cannot disagree. Three
 * is the whole range: this one, next, and the one after. A schedule that runs
 * a year out is a thing to scroll, and a week you step through is a thing to
 * read, which is the difference the simplification is about.
 *
 * Sunday-led, like every other week this app draws. `mondayOfCurrentWeek` is
 * still here for the digests, which think in working weeks.
 */
export const WEEKS_AHEAD = 2;

export function sundayOfWeek(offset = 0, today = todayIso()): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay() + offset * 7);
  return d.toISOString().slice(0, 10);
}

/** The seven ISO dates of that week, in order. */
export function weekDates(offset = 0, today = todayIso()): string[] {
  const start = new Date(`${sundayOfWeek(offset, today)}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

/** "Aug 3 - 9", or "Aug 31 - Sep 6" when it straddles a month. The dash is a
 *  range's own, the same label exemption a date header carries. */
export function weekRangeLabel(offset = 0, today = todayIso()): string {
  const days = weekDates(offset, today);
  const a = new Date(`${days[0]}T00:00:00Z`);
  const b = new Date(`${days[6]}T00:00:00Z`);
  const mon = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const num = (d: Date) => d.getUTCDate();
  const right = mon(a) === mon(b) ? `${num(b)}` : `${mon(b)} ${num(b)}`;
  // The range's own dash, the same exemption a date header carries: this is a
  // label rather than a sentence.
  // check-copy-ignore
  return `${mon(a)} ${num(a)} — ${right}`;
}

export function timeToMinutes(v: string): number {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
}

/** minutes-since-midnight → "HH:MM" 24h, wrapping within a single day. */
export function minutesToTime(mins: number): string {
  const t = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** day-of-week (0 = Monday … 6 = Sunday) for an ISO date, UTC. */
export function dowOfDate(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** day-of-month for an ISO date, UTC - the number shown in the gutter. */
export function domOfDate(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDate();
}

/** "2026-07-26" -> "Sat Jul 26", UTC. */
export function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "2026-07-20" -> "Tue, July 20", UTC - one clean line for a day heading. */
export function fmtDateLong(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "2026-07-28" -> "Tuesday – Jul 28", UTC - the agenda day heading. */
export function fmtDayHeader(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const weekday = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  // The one em dash in the product. A date is a label, not a sentence, and
  // this is the shape it's wanted in. check-copy-ignore
  return `${weekday} — ${md}`;
}

/**
 * The day heading split in two: the name on the left, the date on the right.
 *
 * The band wants them apart rather than joined by the dash, so the relative
 * word and the absolute date are both scannable and the right-hand column
 * stays aligned down the whole scroll. Only the relative words need to know
 * what today is; a weekday and a date are the same whatever the clock says,
 * so `today` is optional and its absence just means no Today or Tomorrow.
 */
export function dayBandLabel(iso: string, today?: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  // Abbreviated, per the design: three letters carry the day as well as nine
  // do at this size, and a band that runs to "Wednesday" pushes its own date
  // toward the edge on a 390px screen.
  const wd = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  // Every band reads the same way: weekday, dash, date. "Today" and "Tomorrow"
  // led their own bands for a long time, with the weekday they displaced
  // pushed into the date so the day was still said. That was the right shape
  // while the band was the only thing marking where you were in the list; the
  // band carries a dot on today now, which says it without spending the label
  // on it, and two bands out of a fortnight worded differently from the rest
  // made the column of dates impossible to scan.
  //
  // `today` stays in the signature because every caller passes it and the dot
  // is decided from the same value; it just no longer changes the words.
  void today;
  // A comma, not the dash, by Matt's call: "Tue, Aug 5", the same shape the
  // class sheet's date fact wears.
  return `${wd}, ${md}`;
}

/** Where a one-off falls relative to the current Mon–Sun week.
    Weekly classes (specificDate null) always show → "current". */
export function weekBucket(
  specificDate: string | null | undefined,
  now = new Date(),
): "current" | "upcoming" | "past" {
  if (!specificDate) return "current";
  const mon = new Date(`${mondayOfCurrentWeek(now)}T00:00:00Z`);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const d = new Date(`${specificDate}T00:00:00Z`);
  if (d < mon) return "past";
  if (d > sun) return "upcoming";
  return "current";
}

export const RESERVED_HANDLES = new Set([
  "app", "api", "auth", "login", "logout", "signup", "admin", "brand",
  "design", "static", "assets", "about", "privacy", "terms", "you", "u",
]);
