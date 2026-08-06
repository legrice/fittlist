// The icon map, checked against the package, without a browser.
//
// `Icon.tsx` maps ~65 Material-era names onto Lucide components. Two things
// can rot here and neither is visible in a diff: a name pointing at a
// component that was renamed out of the package, and two names claiming the
// same key. Both fail silently, because an unknown name renders a plain
// circle by design.
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

// What the file imports from lucide-react, and what it draws by hand. A map
// entry has to point at one or the other; a component that is neither is a
// typo that ships as a blank circle.
const importBlock = src.match(/import \{([\s\S]*?)\} from "lucide-react";/);
if (!importBlock) fail("could not find the lucide-react import");
const imported = new Set(importBlock[1].split(",").map((s) => s.trim()).filter(Boolean));
const handDrawn = new Set([...src.matchAll(/^function ([A-Za-z]+)\(/gm)].map(([, n]) => n));

// And the imports have to be real: lucide-react re-exports every icon from
// its ESM index, so a component missing from there was renamed out of the
// package and would fail the build anyway, but this says which name did it.
const lucideIndex = readFileSync("node_modules/lucide-react/dist/lucide-react.d.ts", "utf8");
for (const comp of imported)
  if (!new RegExp(`\\b${comp}\\b`).test(lucideIndex))
    fail(`${comp} is imported but not in lucide-react`);

const icons = [
  ...grab("const ICONS: Record<string,").matchAll(/^\s{2}([a-z_0-9]+):\s*([A-Za-z][A-Za-z0-9]*),/gm),
].map(([, name, comp]) => ({ name, comp }));

if (icons.length < 50) fail("expected the whole map, parsed " + icons.length);

const seen = new Set();
for (const { name, comp } of icons) {
  if (seen.has(name)) fail("two entries claim the name " + name);
  seen.add(name);
  if (!imported.has(comp) && !handDrawn.has(comp))
    fail(`${name} maps to ${comp}, which is neither imported nor drawn here`);
}

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
    if (!seen.has(n)) missing.add(`${n} (${f})`);
}
if (missing.size) fail("these names render a blank circle: " + [...missing].join(", "));

console.log(`${icons.length} glyphs, all present in the package`);
console.log("ICONS OK");
