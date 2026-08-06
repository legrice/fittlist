// Following: the merged week of everyone you follow, and the rail that filters
// it. This is the only screen a member has, so if it goes red the member side
// of the app has nothing in it.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
//   node scripts/following-smoke.mjs
import { chromium } from "playwright";
import { skipSetup } from "./lib/wizard.mjs";
const BASE = "http://localhost:3000";
const fail = (m) => { throw new Error("FOLLOW FAIL: " + m); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

const mkCoach = async (email, name, studio, classes) => {
  const c = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await c.newPage();
  p.setDefaultTimeout(20000);
  await p.goto(BASE + "/");
  await p.getByRole("button", { name: "Sign up with email" }).click();
  await p.getByPlaceholder("you@example.com").fill(email);
  await p.getByPlaceholder("Password").fill("coach-pass-123");
  await p.getByRole("button", { name: "Create account" }).click();
  await p.getByRole("button", { name: "Not now" }).click().catch(() => {});
  await p.getByText("Pick your link.").waitFor();
  await p.getByPlaceholder("Your name").fill(name);
  await p.getByRole("button", { name: "Claim it" }).click();
  await skipSetup(p);
  if (!classes.length) { await c.close(); return; }
  for (const [nm, day, t] of classes) {
    await p.goto(BASE + "/calendar");
    await p.locator(".wkempty-cta, .wkfab").first().click();
    await p.getByPlaceholder("e.g. Barbell Strength").fill(nm);
    await p.getByRole("button", { name: day, exact: true }).click();
    await p.locator("#fStart").fill(t);
    if (await p.getByRole("button", { name: "Select or start typing a studio" }).count()) {
      await p.getByRole("button", { name: "Select or start typing a studio" }).click();
      const existing = p.locator(".studio-row", { hasText: studio });
      if (await existing.count()) await existing.first().click();
      else {
        await p.getByRole("button", { name: "+ New studio" }).click();
        await p.getByPlaceholder("e.g. Palisade Barbell").fill(studio);
        await p.getByPlaceholder("e.g. 501 Palisade Ave, Jersey City").fill("9 Bloomfield Ave, Montclair NJ");
        await p.getByRole("button", { name: "Add studio" }).click();
      }
    }
    await p.locator(".publishwrap .btn").click();
    await p.waitForTimeout(1300);
    const live = p.locator(".sheet", { hasText: "Your class is live" });
    if (await live.count()) { await live.locator(".sheetclose").click(); await p.waitForTimeout(300); }
  }
  await c.close();
};

await mkCoach("nadia@example.com", "Nadia Haq", "Ember Yoga", [
  ["Yin Basics", "Mo", "07:00"],
  ["Vinyasa Flow", "We", "18:00"],
]);
await mkCoach("theo@example.com", "Theo Lang", "Ironside Gym", [
  ["Conditioning", "Tu", "06:30"],
  ["Barbell Club", "Th", "06:45"],
]);
// A coach with nothing up at all. Followed, and deliberately not on the rail:
// a face with nothing behind it is a chip that can only ever empty the screen.
await mkCoach("quinn@example.com", "Quinn Reyes", "", []);

const c2 = await b.newContext({ viewport: { width: 390, height: 844 } });
const m = await c2.newPage();
m.setDefaultTimeout(20000);
await m.goto(BASE + "/");
await m.getByRole("button", { name: "Sign up with email" }).click();
await m.locator(".roleseg button", { hasText: "here to train" }).click();
await m.getByPlaceholder("you@example.com").fill("kia@example.com");
await m.getByPlaceholder("Password").fill("member-pass-123");
await m.getByRole("button", { name: "Create account" }).click();
await m.getByRole("button", { name: "Not now" }).click().catch(() => {});
await m.getByText("Pick your link.").waitFor();
await m.getByPlaceholder("Your name").fill("Kia");
await m.getByRole("button", { name: "Claim it" }).click();
await m.getByRole("heading", { name: "Add a photo." }).waitFor();
await m.getByRole("button", { name: "Continue" }).click();
await m.locator("#wLocation").fill("Montclair, NJ");
await m.getByRole("button", { name: "Finish setup" }).click();
await m.waitForURL("**/feed");

// Following nobody: the empty state is the whole screen and points at the way out.
await m.locator(".wkempty-t", { hasText: "not following anyone" }).waitFor();
if (await m.locator(".tray").count()) fail("no rail until there is somebody on it");
await m.screenshot({ path: (process.env.SMOKE_OUT ?? ".") + "/shot-fol-empty.png" });

for (const h of ["nadiahaq", "theolang", "quinnreyes"]) {
  await m.goto(BASE + "/" + h);
  await m.getByRole("button", { name: "Follow", exact: true }).first().click();
  await m.waitForTimeout(500);
}

await m.goto(BASE + "/feed");
await m.locator(".tray").waitFor();
await m.waitForTimeout(600);
console.log("this week:", (await m.locator(".wkhead-sum").innerText()).trim());
{
  const faces = (await m.locator(".trayitem-nm").allInnerTexts()).map((t) => t.trim());
  console.log("rail:", faces.join(" | "));
  if (faces.includes("Quinn")) fail("a coach with nothing up should not be on the rail");
  if (!faces.includes("Nadia") || !faces.includes("Theo"))
    fail("both coaches with classes should be on the rail: " + faces.join());
  // Search and the rail's plus are the same act and land in the same place.
  const fab = await m.locator(".wkfab-find").getAttribute("href");
  if (fab !== "/discover") fail("search should open Discover, got " + fab);
}
await m.screenshot({ path: (process.env.SMOKE_OUT ?? ".") + "/shot-fol-week.png" });

// Next week, where nothing has run yet, so both coaches and all four classes
// are still ahead. This week is deliberately partial: a class that has been
// and gone is not an answer to "when can I train next", so on a Wednesday the
// first two days of the week are correctly missing.
await m.locator(".wkarrow").nth(1).click();
await m.waitForTimeout(500);
await m.locator(".wkrow").first().waitFor();
const sum = (await m.locator(".wkhead-sum").innerText()).trim();
console.log("next week:", sum, "| rows:", await m.locator(".wkrow").count());
if (!/from 2 coaches/.test(sum)) fail("expected two coaches next week: " + sum);
if ((await m.locator(".wkrow").count()) !== 4) fail("expected four classes next week");

// The rail filters, single select, and says so.
await m.locator(".trayitem", { hasText: "Nadia" }).click();
await m.waitForTimeout(400);
const sum2 = (await m.locator(".wkhead-sum").innerText()).trim();
console.log("filtered:", sum2, "| rows:", await m.locator(".wkrow").count());
if (!/from Nadia Haq/.test(sum2)) fail("the summary should name the picked coach: " + sum2);
if (!(await m.locator(".trayav.sel").count())) fail("the picked face should wear the ring");
if (!(await m.locator(".trayitem.dim").count())) fail("the others should step back");
await m.screenshot({ path: (process.env.SMOKE_OUT ?? ".") + "/shot-fol-filtered.png" });

// Tapping again gives everyone back.
await m.locator(".trayitem", { hasText: "Nadia" }).click();
await m.waitForTimeout(400);
if (!/from 2 coaches/.test((await m.locator(".wkhead-sum").innerText()).trim()))
  fail("tapping the picked coach again should clear the filter");

// A class opens to say when, where and whose, and offers no way to add it.
await m.locator(".wkrow").first().click();
await m.locator(".clspeek").waitFor();
await m.waitForTimeout(500);
const facts = (await m.locator(".clspeek-facts").innerText()).replace(/\s+/g, " ");
console.log("sheet:", (await m.locator(".clspeek-nm").innerText()).trim(), "|", facts);
// The date is a row now, not an eyebrow over the title, and it leads the
// facts because which day is the first thing anybody checks.
if (!/^DATE/i.test(facts)) fail("the date should be the first fact: " + facts);
if (!/COACH/i.test(facts)) fail("somebody else's class should name the coach");
if (await m.locator(".clspeek-del").count()) fail("no delete on a class that is not yours");
if (!(await m.locator(".clspeek-btn", { hasText: "Share class" }).count()))
  fail("expected Share class");
// The apostrophe is a curly one (&rsquo;), which a straight one in a regex
// will not match. Match either.
// The depth is one tap behind the summary, in the same sheet rather than a
// second one: a class had two designs for a while and two designs for one idea
// is how they drift.
if (!(await m.locator(".clspeek-btn", { hasText: "Full details" }).count()))
  fail("expected Full details");
await m.locator(".clspeek-btn", { hasText: "Full details" }).click();
await m.locator(".clspeek-full").waitFor();
await m.waitForTimeout(400);
{
  const outs = (await m.locator(".clspeek-out").allInnerTexts()).map((t) => t.trim());
  console.log("full details:", outs.join(" | ") || "(no outs)");
  if (!outs.some((o) => /week/.test(o))) fail("the depth should offer the coach's week");
  // ...and it replaced the button it came from rather than stacking beside it.
  if (await m.locator(".clspeek-btn", { hasText: "Full details" }).count())
    fail("Full details should give way to what it opened");
}
await m.screenshot({ path: (process.env.SMOKE_OUT ?? ".") + "/shot-fol-sheet.png" });

// The range has an end, and the arrow greys rather than vanishing.
await m.locator(".clspeek-x").click();
await m.waitForTimeout(300);
await m.locator(".wkarrow").nth(1).click();
await m.waitForTimeout(400);
if (!(await m.locator(".wkarrow").nth(1).isDisabled())) fail("the range should end at three weeks");
if (await m.locator(".wkarrow").first().isDisabled()) fail("back should still be live at the end");
console.log("range ends:", (await m.locator(".wkhead-range").innerText()).trim());

await b.close();
console.log("ALL FOLLOWING CHECKS PASSED");
