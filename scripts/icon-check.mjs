// The icon map, checked against the package, without a browser.
//
// `Icon.tsx` maps ~65 Material-era names onto Phosphor components and gives
// each one a weight. Three things can rot here and none of them is visible in
// a diff: a name pointing at a component that was renamed out of the package,
// a weight exception for a glyph that no longer exists, and two names claiming
// the same key. All three fail silently, because an unknown name renders a
// plain circle by design.
//
// What this deliberately does NOT check is whether a glyph should be filled.
// That was tried as a geometry test (Phosphor draws a mark with no inside as a
// solid rounded rectangle with the mark knocked out, which is a button drawn
// inside a button) and it cannot work: a calendar and a padlock are rounded
// rectangles too, and filled is exactly what they should be. "Does this shape
// have an inside" is a question about meaning, not about path data. The
// WEIGHT table in Icon.tsx is that judgement written down, and the only way to
// check it is to look.
//
//   node scripts/icon-check.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync("src/components/Icon.tsx", "utf8");
const fail = (m) => { throw new Error("ICON FAIL: " + m); };

const grab = (start) => {
  const i = src.indexOf(start);
  if (i < 0) fail("could not find " + start);
  return src.slice(i, src.indexOf("\n};", i));
};
const icons = [
  ...grab("const ICONS: Record<string, Glyph> = {").matchAll(/^\s{2}([a-z_0-9]+):\s*([A-Za-z]+),/gm),
].map(([, name, comp]) => ({ name, comp }));
const bold = [
  ...grab("const WEIGHT: Record<string, Weight> = {").matchAll(/^\s{2}([a-z_0-9]+):/gm),
].map(([, n]) => n);

if (icons.length < 50) fail("expected the whole map, parsed " + icons.length);

const seen = new Set();
for (const { name, comp } of icons) {
  if (seen.has(name)) fail("two entries claim the name " + name);
  seen.add(name);
  let defs;
  try {
    defs = readFileSync(`node_modules/@phosphor-icons/react/dist/defs/${comp}.es.js`, "utf8");
  } catch {
    fail(`${name} maps to ${comp}, which is not in the package`);
  }
  // Both weights, because the table picks between them per name and a glyph
  // missing one would fall back to whatever Phosphor's default is.
  for (const w of ['"bold"', '"fill"'])
    if (!defs.includes(w)) fail(`${comp} has no ${w} weight, so ${name} cannot use it`);
}

const dupes = bold.filter((n, i) => bold.indexOf(n) !== i);
if (dupes.length) fail("the weight table repeats " + dupes.join(", "));
for (const n of bold)
  if (!seen.has(n)) fail(`the weight table names ${n}, which is not a glyph any more`);

// Every call site that names a glyph as a literal, so an `<Icon name="..." />`
// that was never mapped is caught here rather than shipping as a blank circle.
// An unknown name falls back to a plain circle on purpose (a typo should not
// white-screen a page), which is exactly why nothing complains on its own.
//
// Names reached through a lookup table (`ICON[n.type]` in UpdatesScreen) hide
// from this, and that is how every notification row drew a blank circle for
// months. There is no way to grep for those; the answer is to keep such tables
// small and to look at them.
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : join(dir, e.name),
  );
const missing = new Set();
for (const f of walk("src").filter((f) => /\.tsx?$/.test(f))) {
  const body = readFileSync(f, "utf8");
  for (const [, n] of body.matchAll(/<Icon\s[^>]*?name="([a-z_0-9]+)"/g))
    if (!seen.has(n) && n !== "view_list") missing.add(`${n} (${f})`);
}
if (missing.size) fail("these names render a blank circle: " + [...missing].join(", "));

console.log(`${icons.length} glyphs, ${bold.length} drawn bold, all present in the package`);
console.log("ICONS OK");
