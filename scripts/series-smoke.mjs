// The same class at two studios is two classes.
//
// The template is keyed on (coach, class name), so a coach teaching Stretch+ in
// two places had one template across both. Editing either one deleted every
// weekly row carrying that template and rewrote them as a single class: change
// a description, lose the other studio's class. Reported from the field.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
//   node scripts/series-smoke.mjs
import { chromium } from "playwright";
import { skipSetup } from "./lib/wizard.mjs";
const BASE = "http://localhost:3000";
const OUT = process.env.SMOKE_OUT ?? ".";
const fail = (m) => { throw new Error("SERIES FAIL: " + m); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const c = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await c.newPage();
p.setDefaultTimeout(15000);

await p.goto(BASE + "/");
await p.getByRole("button", { name: "Sign up with email" }).click();
await p.getByPlaceholder("you@example.com").fill("coach@example.com");
await p.getByPlaceholder("Password").fill("coach-pass-123");
await p.getByRole("button", { name: "Create account" }).click();
await p.getByRole("button", { name: "Not now" }).click().catch(() => {});
await p.getByText("Pick your link.").waitFor();
await p.getByPlaceholder("Your name").fill("Sarah");
await p.getByRole("button", { name: "Claim it" }).click();
await skipSetup(p);
await p.getByRole("heading", { name: "Your week is empty" }).waitFor();

async function addClass({ name, days, time, studio, first = false }) {
  await p.getByRole("button", { name: first ? "Add your first class" : "Add class" }).click();
  await p.getByRole("heading", { name: "New class" }).waitFor();
  await p.getByPlaceholder("e.g. Barbell Strength").fill(name);
  for (const d of days) await p.getByRole("button", { name: d, exact: true }).click();
  await p.locator("#fStart").fill(time);
  await p.getByRole("button", { name: "Select or start typing a studio" }).click();
  await p.getByRole("heading", { name: "Choose a studio" }).waitFor();
  const existing = p.locator(".studio-row", { hasText: studio }).first();
  if (await existing.count()) await existing.click();
  else {
    await p.getByRole("button", { name: "+ New studio" }).click();
    await p.getByPlaceholder("e.g. Palisade Barbell").fill(studio);
    await p.getByPlaceholder("e.g. 501 Palisade Ave, Jersey City").fill(`1 ${studio} Way, Verona NJ`);
    await p.getByRole("button", { name: "Add studio" }).click();
  }
  await p.locator(".studio-sel .nm", { hasText: studio }).waitFor();
  await p.locator(".publishwrap .btn").click();
  await p.waitForTimeout(900);
}

/** Every distinct "name @ studio @ time" currently on the schedule. */
async function shapes() {
  await p.goto(BASE + "/app");
  await p.locator(".ps-event").first().waitFor();
  await p.waitForTimeout(400);
  const rows = await p.locator(".ps-event").allInnerTexts();
  return [...new Set(rows.map((r) => r.split("\n").slice(0, 3).join(" @ ")))].sort();
}

await addClass({ name: "Stretch+", days: ["Mo", "We"], time: "06:00", studio: "Verona Stretch", first: true });
await addClass({ name: "Stretch+", days: ["Tu", "Th"], time: "18:30", studio: "Montclair Move" });
await addClass({ name: "Move Fast", days: ["Fr"], time: "06:00", studio: "Verona Stretch" });

const before = await shapes();
console.log("before:", JSON.stringify(before));
if (before.length !== 3) fail(`expected 3 distinct classes, got ${before.length}: ${before}`);

// The report: open one and change only its description.
const target = p.locator(".ps-event", { hasText: "Verona Stretch" }).filter({ hasText: "Stretch+" }).first();
await target.click();
await p.getByRole("heading", { name: /Edit class|New class/ }).waitFor();
{
  // The editor shows this class's days, not every day the NAME is taught.
  const lit = await p.locator(".daysel button.on, .dayrow button.on, .daypills button.on").allInnerTexts();
  if (lit.length && lit.join(",") !== "Mo,We")
    fail(`the editor should show this class's days, got ${lit.join(",")}`);
}
await p.locator("#fDesc").fill("Bring a mat.");
await p.locator(".publishwrap .btn").click();
await p.waitForTimeout(1200);

const after = await shapes();
console.log("after: ", JSON.stringify(after));
if (JSON.stringify(after) !== JSON.stringify(before))
  fail(`editing one class changed the others.\n  before ${JSON.stringify(before)}\n  after  ${JSON.stringify(after)}`);
console.log("editing one class leaves the other studio's class alone ok");
await p.screenshot({ path: OUT + "/shot-series.png" });

// And the description actually saved, on this class and not the other one.
await p.goto(BASE + "/app");
await p.locator(".ps-event", { hasText: "Verona Stretch" }).filter({ hasText: "Stretch+" }).first().click();
await p.getByRole("heading", { name: /Edit class/ }).waitFor();
if ((await p.locator("#fDesc").inputValue()) !== "Bring a mat.") fail("the description never saved");
await p.getByRole("button", { name: "Close" }).first().click().catch(() => p.keyboard.press("Escape"));
await p.waitForTimeout(500);
await p.goto(BASE + "/app");
await p.locator(".ps-event", { hasText: "Montclair Move" }).first().click();
await p.getByRole("heading", { name: /Edit class/ }).waitFor();
if ((await p.locator("#fDesc").inputValue()) === "Bring a mat.")
  fail("the edit leaked onto the other studio's class");
await p.getByRole("button", { name: "Close" }).first().click().catch(() => p.keyboard.press("Escape"));
await p.waitForTimeout(500);
console.log("the edit landed on that class only ok");

// Deleting the whole set takes that set only.
await p.goto(BASE + "/app");
await p.locator(".ps-event", { hasText: "Montclair Move" }).first().click();
await p.getByRole("heading", { name: /Edit class/ }).waitFor();
await p.getByRole("button", { name: "Delete this class" }).click();
await p.getByRole("dialog").waitFor();
// "All N days it runs" is the whole-series choice; N comes from this class's
// own days, so it must say 2 and not 4.
const all = p.getByRole("button", { name: /All \d+ days it runs/ }).first();
const label = await all.innerText();
if (!/All 2 days it runs/.test(label)) fail(`the series should be 2 days, the button says "${label}"`);
await all.click();
await p.waitForTimeout(1400);
const left = await shapes();
console.log("after delete:", JSON.stringify(left));
if (left.some((s) => s.includes("Montclair Move"))) fail("the deleted series is still there");
if (!left.some((s) => s.includes("Stretch+ @ Verona Stretch")))
  fail("deleting one series took the same-named class at the other studio with it");
if (!left.some((s) => s.includes("Move Fast"))) fail("deleting a series took an unrelated class");
console.log("deleting a series takes that series only ok");

// The other half of the rule: the SAME class (name, time, place) added on
// another day joins the set rather than starting a second entry. That was the
// old behaviour and it's worth keeping; it was only destructive when the time
// or the studio differed.
await addClass({ name: "Move Fast", days: ["Mo"], time: "06:00", studio: "Verona Stretch" });
await p.goto(BASE + "/app");
await p.locator(".ps-event", { hasText: "Move Fast" }).first().click();
await p.getByRole("heading", { name: /Edit class/ }).waitFor();
await p.getByRole("button", { name: "Delete this class" }).click();
await p.getByRole("dialog").waitFor();
{
  const joined = p.getByRole("button", { name: /All \d+ days it runs/ }).first();
  if (!(await joined.count()))
    fail("adding the same class on another day should join the set, not start a second one");
  const label = await joined.innerText();
  if (!/All 2 days it runs/.test(label)) fail(`expected a 2 day set, the button says "${label}"`);
}
await p.getByRole("button", { name: "Keep it" }).click();
console.log("the same class on another day joins the set ok");

await b.close();
console.log("SERIES CHECKS PASSED");
