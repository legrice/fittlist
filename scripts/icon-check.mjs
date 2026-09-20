// Validate the shared Phosphor registry and every literal icon call site.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const fail = (m) => { throw new Error("ICON FAIL: " + m); };
const src = readFileSync("src/components/Icon.tsx", "utf8");
const adapter = readFileSync("src/components/PhosphorIcons.tsx", "utf8");
const exports = new Set([...adapter.matchAll(/export const (\w+) = appIcon\(/g)].map(([, n]) => n));
const entries = [...src.matchAll(/^  (\w+): (\w+),/gm)];
const seen = new Set();
if (entries.length < 60) fail("incomplete semantic icon registry");
for (const [, name, component] of entries) {
  if (seen.has(name)) fail("duplicate icon " + name);
  if (!exports.has(component)) fail("missing Phosphor component " + component);
  seen.add(name);
}
for (const [, name] of adapter.matchAll(/from "@phosphor-icons\/react\/dist\/ssr\/(\w+)"/g)) {
  readFileSync("node_modules/@phosphor-icons/react/dist/ssr/" + name + ".d.ts");
}
if (!adapter.includes('weight = "regular"')) fail("shared icons must default to outlines");
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
  if (/from ["']lucide-react["']/.test(body)) fail("legacy icon import in " + f);
  for (const [, n] of body.matchAll(/<Icon\s[^>]*?name="([a-z_0-9]+)"/g))
    if (!seen.has(n)) missing.add(`${n} (${f})`);
}
if (missing.size) fail("these names render a blank circle: " + [...missing].join(", "));

console.log(`ICONS OK: ${seen.size} semantic icons use Phosphor`);
