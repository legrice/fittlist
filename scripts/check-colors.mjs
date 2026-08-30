// Brand and appearance pairs that must stay legible in both modes. These
// contracts catch a fixed foreground sitting on a semantic background that
// reverses in dark mode, as well as the older white-on-lime mistake.
import { readFileSync } from "node:fs";

const css = readFileSync("src/app/globals.css", "utf8");
const bad = [];
const limeBackground = /background(?:-color)?\s*:\s*(?:var\(--(?:si|color-lime|color-coaching)\)|#9fe870)(?:\s|;|$)/i;
const whiteForeground = /color\s*:\s*(?:#fff(?:fff)?|white|var\(--color-white\))(?:\s|;|$)/i;
const inkBackground = /background(?:-color)?\s*:\s*var\(--ink\)(?:\s|;|$)/i;
const oliveBackground = /background(?:-color)?\s*:\s*var\(--color-olive\)(?:\s|;|$)/i;
const semanticSurface = /background(?:-color)?\s*:\s*var\(--(?:paper|card|cl|color-surface(?:-muted|-hover)?)\)(?:\s|;|$)/i;
const fixedDarkForeground = /color\s*:\s*(?:#191502|#020d08|black|var\(--color-black\))(?:\s|;|$)/i;

const ruleBody = (marker) => {
  const markerAt = css.indexOf(marker);
  const openAt = css.indexOf("{", markerAt);
  const closeAt = css.indexOf("}", openAt);
  return markerAt >= 0 && openAt >= 0 && closeAt >= 0 ? css.slice(openAt + 1, closeAt) : "";
};
const tokenHex = (body, token, fallbackBody = null, seen = new Set()) => {
  if (seen.has(token)) return null;
  const nextSeen = new Set(seen).add(token);
  const found = body.match(new RegExp(`--${token}\\s*:\\s*([^;\\n}]+)`, "i"));
  if (!found) {
    return fallbackBody && fallbackBody !== body
      ? tokenHex(fallbackBody, token, null, nextSeen)
      : null;
  }
  const value = found[1].trim();
  const hex = value.match(/^#[0-9a-f]{6}$/i);
  if (hex) return hex[0];
  const alias = value.match(/^var\(--([a-z0-9-]+)\)$/i);
  return alias ? tokenHex(body, alias[1], fallbackBody, nextSeen) : null;
};
const luminance = (hex) => {
  const channels = [1, 3, 5]
    .map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255)
    .map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
};
const contrast = (foreground, background) => {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
};

for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const selector = match[1].trim().split("\n").at(-1)?.trim() ?? "unknown rule";
  const body = match[2];
  if (limeBackground.test(body) && whiteForeground.test(body)) {
    bad.push(`${selector} (white on lime)`);
  }
  if (inkBackground.test(body) && whiteForeground.test(body)) {
    bad.push(`${selector} (fixed white on mode-aware ink)`);
  }
  if (semanticSurface.test(body) && fixedDarkForeground.test(body)) {
    bad.push(`${selector} (fixed dark text on a mode-aware surface)`);
  }
  if (oliveBackground.test(body) && fixedDarkForeground.test(body)) {
    bad.push(`${selector} (fixed dark text on olive)`);
  }
}

const light = ruleBody(":root {");
const dark = ruleBody('html[data-mode="dark"],');
const semanticPairs = [
  ["light primary/background", light, "color-text-primary", "color-background"],
  ["light primary/surface", light, "color-text-primary", "color-surface"],
  ["light primary/muted surface", light, "color-text-primary", "color-surface-muted"],
  ["light secondary/background", light, "color-text-secondary", "color-background"],
  ["light secondary/surface", light, "color-text-secondary", "color-surface"],
  ["light secondary/muted surface", light, "color-text-secondary", "color-surface-muted"],
  ["dark primary/background", dark, "color-text-primary", "color-background"],
  ["dark primary/surface", dark, "color-text-primary", "color-surface"],
  ["dark primary/muted surface", dark, "color-text-primary", "color-surface-muted"],
  ["dark secondary/background", dark, "color-text-secondary", "color-background"],
  ["dark secondary/surface", dark, "color-text-secondary", "color-surface"],
  ["dark secondary/muted surface", dark, "color-text-secondary", "color-surface-muted"],
  ["light danger/surface", light, "color-danger-text", "color-surface"],
  ["light danger/background", light, "color-danger-text", "color-background"],
  ["dark danger/surface", dark, "color-danger-text", "color-surface"],
  ["dark danger/background", dark, "color-danger-text", "color-background"],
  ["light brand ink/tint", light, "si-ink", "si-tint"],
  ["dark brand ink/tint", dark, "si-ink", "si-tint"],
  ["light brand ink/surface", light, "si-ink", "color-surface"],
  ["dark brand ink/surface", dark, "si-ink", "color-surface"],
  ["light inverse ink/paper", light, "ink", "paper"],
  ["dark inverse ink/paper", dark, "ink", "paper"],
  ["black/lime", light, "color-black", "color-lime"],
  ["white/olive", light, "color-white", "color-olive"],
  ["coaching tag", light, "color-coaching-text", "color-coaching"],
  ["shift tag", light, "color-shift-text", "color-shift"],
  ["saved tag", light, "color-attending-text", "color-attending"],
  ["personal tag", light, "color-personal-text", "color-personal"],
];
for (const [label, body, foregroundToken, backgroundToken] of semanticPairs) {
  const foreground = tokenHex(body, foregroundToken, light);
  const background = tokenHex(body, backgroundToken, light);
  if (!foreground || !background) {
    bad.push(`${label} (missing color token)`);
    continue;
  }
  const ratio = contrast(foreground, background);
  if (ratio < 4.5) bad.push(`${label} (${ratio.toFixed(2)}:1)`);
}

// These controls inherit one half of their color pair from another rule or
// ancestor, which the local rule scan above intentionally cannot infer. Keep
// their semantic contracts explicit so a future fixed-color regression fails
// without pretending this lightweight check is a full CSS cascade engine.
const contracts = [
  [".wizstudio-tick {", "wizard selected tick foreground", /color\s*:\s*var\(--paper\)/i],
  [".shtick {", "Share selected tick foreground", /color\s*:\s*var\(--paper\)/i],
  [".shtick.on {", "Share selected tick background", /background\s*:\s*var\(--ink\)/i],
  [".monthpill.ev-following {", "following month chip foreground", /color\s*:\s*var\(--color-white\)/i],
  [".cash-class-favorite {", "Calendar favorite foreground", /color\s*:\s*var\(--si-ink\)/i],
  [".disrow-txt .wk {", "Discover week-count foreground", /color\s*:\s*var\(--si-ink\)/i],
  [".group-handle-status {", "group handle error foreground", /color\s*:\s*var\(--color-danger-text\)/i],
  [".group-handle-status.ok {", "group handle success foreground", /color\s*:\s*var\(--si-ink\)/i],
  [".shclass-tag.coaching {", "Share coaching tag background", /background\s*:\s*var\(--si-tint\)/i],
  [".shclass-tag.coaching {", "Share coaching tag foreground", /color\s*:\s*var\(--si-ink\)/i],
];
for (const [marker, label, declaration] of contracts) {
  const body = ruleBody(marker);
  if (!body) bad.push(`${label} (missing rule)`);
  else if (!declaration.test(body)) bad.push(`${label} (missing semantic color)`);
}

if (bad.length) {
  console.error(
    "COLOR FAIL: foreground/background pair can lose contrast.\n  " + bad.join("\n  "),
  );
  process.exit(1);
}

console.log("colors ok (brand and light/dark foreground pairs are safe)");
