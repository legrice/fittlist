import assert from "node:assert/strict";
import { shareContentRevision } from "../src/lib/share-content-revision.ts";

const base = {
  kind: "coach",
  handle: "matt",
  storyPrefs: {
    headline: "Come train with me",
    design: { themeId: "paper", styleId: "plain" },
  },
  items: [
    {
      key: "class-1.2026-09-02",
      iso: "2026-09-02",
      time: "5:00p",
      name: "Guns, Buns, and Lungs",
      where: "Ironbound Performance Athletics",
      who: "Matt",
      coaching: true,
    },
  ],
};

const sameContentDifferentKeyOrder = {
  handle: "matt",
  kind: "coach",
  items: [
    {
      coaching: true,
      who: "Matt",
      where: "Ironbound Performance Athletics",
      name: "Guns, Buns, and Lungs",
      time: "5:00p",
      iso: "2026-09-02",
      key: "class-1.2026-09-02",
    },
  ],
  storyPrefs: {
    design: { styleId: "plain", themeId: "paper" },
    headline: "Come train with me",
  },
};

const revision = shareContentRevision(base);
assert.equal(
  revision,
  shareContentRevision(sameContentDifferentKeyOrder),
  "equivalent payloads must reuse the same revision",
);
assert.equal(
  revision,
  shareContentRevision({ ...base, handle: " matt " }),
  "incidental handle whitespace should be normalized",
);
assert.notEqual(
  revision,
  shareContentRevision({
    ...base,
    items: [{ ...base.items[0], where: "A different studio" }],
  }),
  "a changed export field must invalidate the revision",
);
assert.notEqual(
  revision,
  shareContentRevision({
    ...base,
    items: [{ ...base.items[0], futureHubField: "new visual metadata" }],
  }),
  "future item fields must participate without changing the fingerprint utility",
);
assert.notEqual(
  revision,
  shareContentRevision({
    ...base,
    storyPrefs: { ...base.storyPrefs, headline: "A different week" },
  }),
  "changed story preferences must invalidate the revision",
);

const largeBackground = `data:image/jpeg;base64,${"a".repeat(2_200_000)}`;
const largeStart = performance.now();
const largeRevision = shareContentRevision({
  ...base,
  storyPrefs: { ...base.storyPrefs, background: largeBackground },
});
const largeDuration = performance.now() - largeStart;
assert.notEqual(largeRevision, revision, "a large background must invalidate the revision");
assert.notEqual(
  largeRevision,
  shareContentRevision({
    ...base,
    storyPrefs: {
      ...base.storyPrefs,
      background: `${largeBackground.slice(0, -1)}b`,
    },
  }),
  "the complete contents of a large background must participate in the revision",
);
assert.ok(
  largeDuration < 50,
  `large background fingerprint should stay off the long-task path (${largeDuration.toFixed(1)}ms)`,
);

console.log(
  `share content revision ok (${revision}; 2.2MB background ${largeDuration.toFixed(1)}ms)`,
);
