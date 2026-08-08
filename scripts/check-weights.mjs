// The type scale's ceiling, held.
//
// 600 is the heaviest weight the app uses. It has been 900 (which the family
// does not ship, so it rendered as 800), then 800, then 700, and each step
// down was a judgement about how a screen of class names reads. What makes the
// cap real rather than a convention is that the 700 and 800 faces are not
// declared at all: a rule asking for 700 gets the 600 file synthesised or
// snapped, which looks almost right and is the kind of drift nobody sees.
//
// So this checks both ends. No rule may ask for more than 600, and no face
// heavier than 600 may be declared. The Satori share image is exempt and is
// not CSS: it is a 1080px canvas seen at a glance, loads its own static TTFs,
// and keeps 700 and 800.
//
//   node scripts/check-weights.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MAX = 600;
const css = readFileSync("src/app/globals.css", "utf8");
const bad = [];

for (const [, w] of css.matchAll(/font-weight:\s*(\d{3})/g))
  if (Number(w) > MAX) bad.push(`font-weight: ${w} in globals.css`);

for (const [, w] of css.matchAll(/@font-face[^}]*font-weight:\s*(\d{3})/g))
  if (Number(w) > MAX) bad.push(`a @font-face declares ${w}`);

// Inline styles in the app. The image routes and the two paint modules are
// the exemption, and they are named rather than pattern-matched so adding a
// third has to be a decision.
const EXEMPT = [
  "src/lib/storyimage.tsx",
  "src/lib/cardimage.tsx",
  "src/app/api/",
];
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : join(dir, e.name),
  );
for (const f of walk("src").filter((f) => /\.tsx?$/.test(f))) {
  if (EXEMPT.some((e) => f.startsWith(e))) continue;
  const body = readFileSync(f, "utf8");
  for (const [, w] of body.matchAll(/fontWeight:\s*(\d{3})/g))
    if (Number(w) > MAX) bad.push(`fontWeight: ${w} in ${f}`);
  for (const [, w] of body.matchAll(/weight:\s*(\d{3})/g))
    if (Number(w) > MAX) bad.push(`weight: ${w} in ${f}`);
}

if (bad.length) {
  console.error("WEIGHT FAIL: " + MAX + " is the ceiling.\n  " + bad.join("\n  "));
  process.exit(1);
}
console.log(`weights ok (nothing above ${MAX})`);
