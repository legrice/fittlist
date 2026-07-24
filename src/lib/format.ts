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

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** [0, 2, 4] -> "Mon, Wed & Fri" */
export function fmtDays(days: number[]): string {
  const names = [...days].sort((a, b) => a - b).map((d) => DAY_SHORT[d]);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

export function timeToMinutes(v: string): number {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
}

export const RESERVED_HANDLES = new Set([
  "app", "api", "auth", "login", "logout", "signup", "admin", "brand",
  "design", "static", "assets", "about", "privacy", "terms", "you", "u",
]);
