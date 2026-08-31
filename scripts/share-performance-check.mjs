// Cheap, deterministic guardrails for the Share editor's hot path.
//
// Run with:
//   node --import tsx scripts/share-performance-check.mjs
//
// The live editor may plan its schedule repeatedly while somebody changes
// dates, classes or styles. That work must stay pure and inexpensive. The
// high-resolution compose endpoint, by contrast, belongs only to the final
// Share action and must never become the live preview again.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { planStory } from "../src/lib/storyplan.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const shareHubPath = join(root, "src/components/ShareHubScreen.tsx");
const livePreviewPath = join(root, "src/components/ShareLivePreview.tsx");
const obsoleteSharePaths = [
  join(root, "src/components/ShareWeekSheet.tsx"),
  join(root, "src/components/StoryPreview.tsx"),
];

const DAYS = ["MON Sep 1", "TUE Sep 2", "WED Sep 3", "THU Sep 4", "FRI Sep 5", "SAT Sep 6", "SUN Sep 7"];
const NAMES = [
  "Strength and Mobility",
  "Guns, Buns, and Lungs",
  "Soul Flow Yoga",
  "Mat Pilates — Tone and Sculpt",
  "Flow and Restore",
];
const PLACES = ["Ironbound Performance Athletics", "Asana Soul Practice", "Studio Arc"];

const fullWeek = DAYS.map((day, dayIndex) => ({
  day,
  items: Array.from({ length: 8 }, (_, itemIndex) => ({
    time: `${6 + ((dayIndex + itemIndex) % 12)}:${itemIndex % 2 ? "30" : "00"}${itemIndex < 5 ? "a" : "p"}`,
    name: NAMES[(dayIndex + itemIndex) % NAMES.length],
    where: PLACES[(dayIndex + itemIndex) % PLACES.length],
    who: itemIndex % 3 === 0 ? "Erin" : "",
  })),
}));

// Prebuild representative edit states so the budget measures the shared
// planner, not fixture allocation: date ranges, hidden classes, style row
// density and the teaching/member place treatment all vary.
const variants = Array.from({ length: 72 }, (_, index) => {
  const dayCount = 1 + (index % fullWeek.length);
  const hideEvery = 2 + (index % 5);
  const days = fullWeek.slice(0, dayCount).map((day) => ({
    ...day,
    items: day.items.filter((_, itemIndex) => (itemIndex + index) % hideEvery !== 0),
  }));
  return {
    days,
    budget: 440 + (index % 9) * 125,
    summaryWidth: 620 + (index % 4) * 48,
    options: { keepPlacesWithClasses: index % 2 === 0 },
  };
});

const expectedPlans = variants.map((variant) =>
  planStory(variant.days, variant.budget, variant.summaryWidth, variant.options),
);
for (let index = 0; index < variants.length; index += 1) {
  const variant = variants[index];
  assert.deepEqual(
    planStory(variant.days, variant.budget, variant.summaryWidth, variant.options),
    expectedPlans[index],
    `layout planning changed between identical edit states at variant ${index}`,
  );
}

// Warm JIT paths before timing. Three seconds for 25k representative edits is
// intentionally generous: this is a regression tripwire, not a flaky micro-
// benchmark. Typical development hardware should finish far below it.
for (let index = 0; index < variants.length * 4; index += 1) {
  const variant = variants[index % variants.length];
  planStory(variant.days, variant.budget, variant.summaryWidth, variant.options);
}

const EDITS = 25_000;
const MAX_EDIT_PLANNING_MS = 3_000;
let checksum = 0;
const planningStarted = performance.now();
for (let index = 0; index < EDITS; index += 1) {
  const variant = variants[index % variants.length];
  const plan = planStory(variant.days, variant.budget, variant.summaryWidth, variant.options);
  checksum += plan.tier + plan.moreDays + plan.days.length + plan.summary.length;
}
const planningMs = performance.now() - planningStarted;
assert.ok(checksum > 0, "planner benchmark must consume its output");
assert.ok(
  planningMs < MAX_EDIT_PLANNING_MS,
  `${EDITS.toLocaleString()} representative Share edits took ${planningMs.toFixed(1)}ms ` +
    `(limit ${MAX_EDIT_PLANNING_MS}ms)`,
);

const shareHub = readFileSync(shareHubPath, "utf8");
const livePreview = readFileSync(livePreviewPath, "utf8");

assert.match(
  livePreview,
  /className="shlive-canvas"[\s\S]*?transform:`translate\(-50%, -50%\) scale\(\$\{previewScale\}\)`/,
  "the live preview must explicitly scale its DOM canvas instead of relying on Safari foreignObject sizing",
);

for (const obsoletePath of obsoleteSharePaths) {
  assert.equal(
    existsSync(obsoletePath),
    false,
    `${obsoletePath} must not return as a second eager share-generator path`,
  );
}

assert.doesNotMatch(
  shareHub,
  /\bSlideImg\b/,
  "ShareHub must use the lightweight live preview, not the compose-image SlideImg path",
);
assert.match(
  shareHub,
  /\/api\/story\/compose\?/,
  "the final Share export must continue to use the canonical compose endpoint",
);

// Identify the URL variable whose template contains the compose endpoint. The
// declaration may wrap useMemo or span several lines, so choose the nearest
// `const` before the endpoint rather than depending on one exact variable name.
const composeIndex = shareHub.indexOf("/api/story/compose?");
const declarationWindow = shareHub.slice(Math.max(0, composeIndex - 600), composeIndex);
const declarations = [...declarationWindow.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=/g)];
const exportUrlName = declarations.at(-1)?.[1];
assert.ok(exportUrlName, "could not identify the compose export URL variable");

const escapedExportUrlName = exportUrlName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
assert.doesNotMatch(
  shareHub,
  new RegExp(`(?:src|srcSet)\\s*=\\s*\\{\\s*${escapedExportUrlName}\\s*\\}`),
  "the compose export URL must not be mounted as the live preview image",
);

const shareHandlerStart = shareHub.search(/(?:const\s+shareImage\s*=\s*async|async\s+function\s+shareImage)/);
assert.ok(shareHandlerStart >= 0, "ShareHub must retain an explicit on-demand shareImage handler");
const nextDeclaration = shareHub.indexOf("\n  const ", shareHandlerStart + 20);
const shareHandlerEnd = nextDeclaration >= 0 ? nextDeclaration : shareHub.length;
const shareHandler = shareHub.slice(shareHandlerStart, shareHandlerEnd);
assert.match(
  shareHandler,
  new RegExp(`\\b${escapedExportUrlName}\\b`),
  "the Share action must consume the current compose export URL",
);

// Fetching the compose URL anywhere before the Share handler is eager image
// generation. Native iOS may hand the URL directly to its bridge, while web
// fetches it in this handler; both are on-demand.
const eagerFetch = new RegExp(`fetch\\(\\s*${escapedExportUrlName}\\b`, "g");
for (const match of shareHub.matchAll(eagerFetch)) {
  assert.ok(
    match.index >= shareHandlerStart && match.index < shareHandlerEnd,
    "compose export must not be fetched before the user taps Share",
  );
}

console.log(
  `share performance ok (${EDITS.toLocaleString()} edit plans in ${planningMs.toFixed(1)}ms; ` +
    `stable output and on-demand compose export)`,
);
