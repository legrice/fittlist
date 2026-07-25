// Shared display logic — mirrors the prototype's helpers exactly.

export const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
export type DayName = (typeof DAYS)[number];

export const TIME_PRESETS = ["06:00", "09:00", "12:00", "17:30", "18:30"];
export const DUR_PRESETS = [30, 45, 50, 60, 75];
export const LINK_LABELS = ["Website", "Mindbody", "ClassPass", "Other"];

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

// Story-image looks — one per coach personality, all built from brand colors.
export type StoryThemeId = "iron" | "paper" | "moss" | "pop";
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
  iron: { label: "Iron", bg: "#191502", fg: "#F7F2E8", accent: "#DD583A", muted: "#C9C3AE", faint: "#8A8570", time: "#DAD4BE", lockup: "cloud" },
  paper: { label: "Paper", bg: "#F7F2E8", fg: "#191502", accent: "#DD583A", muted: "#4E4B3B", faint: "#8A8570", time: "#3A3526", lockup: "ink" },
  moss: { label: "Moss", bg: "#4E4B3B", fg: "#F7F2E8", accent: "#CBD665", muted: "#C9C3AE", faint: "#A8A48E", time: "#E6E3D6", lockup: "cloud" },
  pop: { label: "Pop", bg: "#DD583A", fg: "#F7F2E8", accent: "#191502", muted: "#F9E4DD", faint: "#F2C1B2", time: "#FFF2EA", lockup: "cloud", lockupAccent: "#191502" },
};
export function storyTheme(id: string | null): [StoryThemeId, StoryTheme] {
  const key = (id && id in STORY_THEMES ? id : "iron") as StoryThemeId;
  return [key, STORY_THEMES[key]];
}

/** "17:30" -> "5:30p" */
export function fmtTime(v: string): string {
  const [hRaw, m] = v.split(":").map(Number);
  const ap = hRaw >= 12 ? "p" : "a";
  const h = hRaw % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")}${ap}`;
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "") || "you";
}

export function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_ORIGIN || "https://fittlist.co";
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

/** day-of-week (0 = Monday … 6 = Sunday) for an ISO date, UTC. */
export function dowOfDate(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** day-of-month for an ISO date, UTC — the number shown in the gutter. */
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

/** "2026-07-20" -> "Tue, July 20", UTC — one clean line for a day heading. */
export function fmtDateLong(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
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
