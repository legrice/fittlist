// Bright lime always carries black foreground content. This catches legacy
// white-on-orange rules when the shared brand token is lime, before they ship.
import { readFileSync } from "node:fs";

const css = readFileSync("src/app/globals.css", "utf8");
const bad = [];
const limeBackground = /background(?:-color)?\s*:\s*(?:var\(--(?:si|color-lime|color-coaching)\)|#9fe870)(?:\s|;|$)/i;
const whiteForeground = /color\s*:\s*(?:#fff(?:fff)?|white|var\(--color-white\))(?:\s|;|$)/i;

for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const selector = match[1].trim().split("\n").at(-1)?.trim() ?? "unknown rule";
  const body = match[2];
  if (limeBackground.test(body) && whiteForeground.test(body)) bad.push(selector);
}

if (bad.length) {
  console.error(
    "COLOR FAIL: bright lime must use black text and icons.\n  " + bad.join("\n  "),
  );
  process.exit(1);
}

console.log("colors ok (bright lime uses black foregrounds)");
