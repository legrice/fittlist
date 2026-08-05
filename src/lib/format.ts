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

// Story-image looks - one per coach personality, all built from brand colors.
export type StoryThemeId =
  | "iron"
  | "paper"
  | "moss"
  | "pop"
  | "midnight"
  | "sunset"
  | "blush"
  | "slate";
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
  paper: { label: "Cream", bg: "#f4efe1", fg: "#191502", accent: "#C2410C", muted: "#6b6555", faint: "#8a8570", time: "#3a3526", lockup: "ink" },
  iron: { label: "Ink", bg: "#191502", fg: "#f4efe1", accent: "#C2410C", muted: "#c9c3ae", faint: "#8a8570", time: "#dad4be", lockup: "cloud" },
  moss: { label: "Moss", bg: "#4E4B3B", fg: "#F7F2E8", accent: "#CBD665", muted: "#C9C3AE", faint: "#A8A48E", time: "#E6E3D6", lockup: "cloud" },
  pop: { label: "Pop", bg: "#C2410C", fg: "#f4efe1", accent: "#191502", muted: "#f9e4dd", faint: "#f2c1b2", time: "#fff2ea", lockup: "cloud", lockupAccent: "#191502" },
  midnight: { label: "Midnight", bg: "#161e33", fg: "#f2efe4", accent: "#e5b558", muted: "#9aa3ba", faint: "#77809a", time: "#d5d9e6", lockup: "cloud", lockupAccent: "#e5b558" },
  sunset: { label: "Sunset", bg: "linear-gradient(170deg, #3b1c53 0%, #8f3a5f 55%, #d96b4a 100%)", fg: "#fdf3e6", accent: "#ffc46b", muted: "#e5c3bc", faint: "#d3a9a6", time: "#ffe6cf", lockup: "cloud", lockupAccent: "#ffc46b" },
  blush: { label: "Blush", bg: "#f7dde2", fg: "#3d1b25", accent: "#c2385e", muted: "#8f6470", faint: "#b18f98", time: "#5c333f", lockup: "ink", lockupAccent: "#c2385e" },
  slate: { label: "Slate", bg: "#2b2e33", fg: "#eef0ee", accent: "#c9e265", muted: "#a3a8ad", faint: "#7f858c", time: "#d8dcd8", lockup: "cloud", lockupAccent: "#c9e265" },
};
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
  let day = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  if (today) {
    const t = new Date(`${today}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + 1);
    if (iso === today) day = "Today";
    else if (iso === t.toISOString().slice(0, 10)) day = "Tomorrow";
  }
  // The date label's own dash, the same one fmtDayHeader carries and for the
  // same reason: a date is a label rather than a sentence, and this is the
  // shape it is wanted in. Today and Tomorrow keep their date rather than
  // replacing it, so a relative word still says which day it means.
  // check-copy-ignore
  return `${day} — ${md}`;
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
