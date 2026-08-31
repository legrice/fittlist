// Regression for the dense-week Satori path. Run with:
//
//   node --import tsx scripts/storyimage-tier3-check.mjs
//
// Consuming the body matters: ImageResponse defers Satori layout and PNG
// encoding until its stream is read, so merely constructing the response
// would let malformed JSX styles pass this check.

import React from "react";

globalThis.React = React;

const [{ renderStory }, { STORY_STYLES, STORY_THEMES }, storyPlan] = await Promise.all([
  import("../src/lib/storyimage.tsx"),
  import("../src/lib/format.ts"),
  import("../src/lib/storyplan.ts"),
]);

const fail = (message) => {
  console.error(`STORYIMAGE TIER-3 FAIL: ${message}`);
  process.exit(1);
};

const labels = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const days = labels.map((day, index) => ({
  day,
  items: [
    {
      time: `${index + 6}:00a`,
      name: `Busy class ${index + 1}`,
      where: `Studio ${index + 1}`,
    },
  ],
}));

// Seven fully attributed classes fit the normal story at tier 2. A featured
// class reserves its fixed card first, making this the realistic busy tier-3
// branch that previously passed `lineClamp: undefined` to Satori.
const budget =
  storyPlan.listBudget(282, "story") - storyPlan.storyFeatureBudget("story");
const plan = storyPlan.planStory(days, budget, 764, { keepPlacesWithClasses: true });
if (plan.tier !== 3) fail(`fixture should reach tier 3, got tier ${plan.tier}`);

const started = performance.now();
const response = renderStory({
  theme: STORY_THEMES.paper,
  style: STORY_STYLES.plain,
  format: "story",
  line1: "Come train",
  line2: "with me",
  headlineSize: 100,
  photo: null,
  // Exercise the editor's movable schedule path, not only its default zero.
  scheduleY: 180,
  feature: {
    day: "TODAY",
    time: "5:00p",
    name: "Featured strength",
    sub: "FittList Studio",
  },
  plan,
  empty: false,
  emptyLine: "Nothing on the calendar yet.",
  url: "fittlist.co/performance-check",
});

if (response.status !== 200) fail(`ImageResponse returned ${response.status}`);
if (!response.body) fail("ImageResponse did not expose a body stream");

const reader = response.body.getReader();
let bytes = 0;
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  bytes += value.byteLength;
}

if (bytes < 10_000) fail(`rendered PNG was unexpectedly small (${bytes} bytes)`);

const elapsed = Math.round((performance.now() - started) * 10) / 10;
console.log(`storyimage tier-3 ok (${bytes} bytes, ${elapsed}ms)`);
