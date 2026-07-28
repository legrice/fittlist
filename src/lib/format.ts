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

// Curated class categories. Kept short and canonical so the per-studio catalog
// (and a future member-facing browse) stays organized instead of ten spellings
// of the same thing.
export const CLASS_TYPES = [
  "Strength",
  "HIIT",
  "Conditioning",
  "Bootcamp",
  "Cycle",
  "Yoga",
  "Pilates",
  "Barre",
  "Mobility",
  "Boxing",
  "Run",
  "Dance",
  "Other",
] as const;
export type ClassType = (typeof CLASS_TYPES)[number];

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
  paper: { label: "Cream", bg: "#f4efe1", fg: "#191502", accent: "#dd6a35", muted: "#6b6555", faint: "#8a8570", time: "#3a3526", lockup: "ink" },
  iron: { label: "Ink", bg: "#191502", fg: "#f4efe1", accent: "#dd6a35", muted: "#c9c3ae", faint: "#8a8570", time: "#dad4be", lockup: "cloud" },
  moss: { label: "Moss", bg: "#4E4B3B", fg: "#F7F2E8", accent: "#CBD665", muted: "#C9C3AE", faint: "#A8A48E", time: "#E6E3D6", lockup: "cloud" },
  pop: { label: "Pop", bg: "#dd6a35", fg: "#f4efe1", accent: "#191502", muted: "#f9e4dd", faint: "#f2c1b2", time: "#fff2ea", lockup: "cloud", lockupAccent: "#191502" },
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

/** ISO date (YYYY-MM-DD) of the current week's Monday, UTC. */
export function mondayOfCurrentWeek(now = new Date()): string {
  const day = (now.getUTCDay() + 6) % 7; // 0 = Monday
  const m = new Date(now);
  m.setUTCDate(now.getUTCDate() - day);
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
  return `${weekday} – ${md}`;
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
