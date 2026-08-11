// The story canvas is 1080x1920 and does not grow, so the only thing standing
// between a busy coach and a poster with the footer printed over Thursday is
// the sums in src/lib/storyplan.ts agreeing with what the routes paint. They
// disagreed for months: rows were drawn until the space ran out, and eight
// classes was already enough to clip a real coach's share.
//
// This holds the planner to its budget across every shape of week worth
// worrying about. It needs no browser and no database:
//
//   node scripts/storyplan-check.mjs
import { listBudget, measurePlan, planStory } from "../src/lib/storyplan.ts";
import { STORY_STYLES } from "../src/lib/format.ts";

const fail = (m) => {
  console.error("STORYPLAN FAIL: " + m);
  process.exit(1);
};

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const TIMES = ["6:00a", "7:30a", "9:00a", "10:30a", "12:00p", "5:30p", "7:00p", "8:30p"];
// The longest names beta coaches actually use, and then some.
const NAMES = [
  "HYROX",
  "Guns, Buns, and Lungs",
  "Vinyasa Flow",
  "Deep Stretch and Restore",
  "Saturday Morning Community Conditioning Class",
];
const PLACES = [
  "Ironbound Performance Athletics",
  "Bloom Yoga Montclair",
  "Riverside Wellness",
  "The Loft",
];

/** Every headline size a coach can land on, shortest and tallest. */
const HEADLINES = [104, 86, 70].flatMap((h) => [h * 0.98 * 2 + 78, h * 0.98 + 78]);

function week({ days, perDay, names, places, longNames }) {
  return Array.from({ length: days }, (_, d) => ({
    day: DAYS[d % 7],
    items: Array.from({ length: perDay }, (_, i) => ({
      time: TIMES[i % TIMES.length],
      name: longNames ? NAMES[4] : NAMES[i % names],
      where: PLACES[i % places],
    })),
  }));
}

let checked = 0;
const tiers = new Set();
for (const headline of HEADLINES)
  for (const days of [1, 2, 3, 4, 5, 6, 7])
    for (const perDay of [1, 2, 3, 4, 5, 6, 8, 10])
      for (const names of [1, 2, 5])
        for (const places of [1, 2, 4])
          for (const longNames of [false, true]) {
            const budget = listBudget(headline);
            const plan = planStory(week({ days, perDay, names, places, longNames }), budget);
            const drawn = measurePlan(plan);
            tiers.add(plan.tier);
            checked++;
            if (drawn > budget)
              fail(
                `${days}d x ${perDay} (${places} places, headline ${Math.round(headline)}) ` +
                  `planned tier ${plan.tier} at ${Math.round(drawn)}px into ${Math.round(budget)}px`,
              );
            // Dropping a day is the last resort, so it may only happen once the
            // poster is genuinely full: tier 3, at its smallest type.
            if (plan.moreDays > 0 && plan.tier !== 3)
              fail(`tier ${plan.tier} dropped ${plan.moreDays} days, which only tier 3 may do`);
            // Nothing may go missing quietly. Either every day is on the
            // poster, or the poster says how many are not.
            const shown = plan.tier === 3 ? plan.summary.length : plan.days.length;
            if (shown + plan.moreDays !== days)
              fail(`${days} days in, ${shown} drawn and ${plan.moreDays} owned up to`);
          }

if (!(tiers.has(1) && tiers.has(2) && tiers.has(3)))
  fail(`only reached tiers ${[...tiers].join(", ")}; the check isn't exercising all three`);

// Every visual layout declares how much taller its rows draw. The routes
// divide by that scale before planning; hold that contract here so a new
// card treatment cannot quietly spend more vertical space than it reserved.
for (const [id, style] of Object.entries(STORY_STYLES)) {
  const budget = listBudget(282);
  const plan = planStory(
    week({ days: 5, perDay: 3, names: 5, places: 4, longNames: false }),
    budget / style.rowScale,
  );
  const claimed = measurePlan(plan) * style.rowScale;
  if (claimed > budget)
    fail(`${id} claims ${Math.round(claimed)}px inside a ${Math.round(budget)}px layout budget`);
}

// A single class must never be summarised: the simplest week keeps the layout
// the poster was designed around.
{
  const plan = planStory(week({ days: 1, perDay: 1, names: 1, places: 1 }), listBudget(282));
  if (plan.tier !== 1) fail(`one class should draw at tier 1, got ${plan.tier}`);
}
// The same class twice in a day is one line with both its times on it.
{
  const dense = Array.from({ length: 7 }, (_, d) => ({
    day: DAYS[d],
    items: TIMES.map((time) => ({ time, name: "Vinyasa Flow", where: PLACES[0] })),
  }));
  const plan = planStory(dense, listBudget(282));
  if (plan.tier !== 3) fail(`56 classes should summarise, got tier ${plan.tier}`);
  const first = plan.summary[0];
  if (first.entries.length !== 1)
    fail(`one class name should collapse to one entry, got ${first.entries.length}`);
  if (first.entries[0].times.split(",").length !== TIMES.length)
    fail(`the collapsed entry lost times: ${first.entries[0].times}`);
}

console.log(`storyplan ok (${checked} weeks, tiers ${[...tiers].sort().join("/")}, none overflowed)`);
