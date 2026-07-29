// Back has to go back.
//
// A coach page links into a class page and the class page links to the coach,
// and both "back" controls used to push. Tapping between them grew history
// every time, so the browser button could only walk the pile: profile, class,
// profile, class, with no way out. Reported from the field.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
//   node scripts/nav-smoke.mjs
import { chromium } from "playwright";
import { skipSetup } from "./lib/wizard.mjs";
const BASE = "http://localhost:3000";
const fail = (m) => { throw new Error("NAV FAIL: " + m); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const c = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await c.newPage();
p.setDefaultTimeout(15000);

// a coach with a class to tap into
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
await p.getByRole("button", { name: "Add your first class" }).click();
await p.getByPlaceholder("e.g. Barbell Strength").fill("Stretch+");
for (const d of ["Mo", "Tu", "We", "Th", "Fr"]) {
  await p.getByRole("button", { name: d, exact: true }).click();
}
await p.getByRole("button", { name: "Select or start typing a studio" }).click();
await p.getByRole("button", { name: "+ New studio" }).click();
await p.getByPlaceholder("e.g. Palisade Barbell").fill("Verona Stretch");
await p.getByPlaceholder("e.g. 501 Palisade Ave, Jersey City").fill("1 Bloomfield Ave, Verona NJ");
await p.getByRole("button", { name: "Add studio" }).click();
await p.locator(".publishwrap .btn").click();
await p.waitForTimeout(900);
console.log("coach fixture ok");

// A visitor, arriving at the schedule the way anyone does: from a link. Each
// tab is its own URL now, so the classes live at /sarah/schedule; tapping the
// coach's name from a class goes to /sarah, which samePage() treats as the
// same screen, so it pops rather than pushing a fourth entry.
const v = await b.newContext({ viewport: { width: 390, height: 844 } });
const q = await v.newPage();
q.setDefaultTimeout(15000);
await q.goto(BASE + "/sarah/schedule");
await q.locator(".ps-event").first().waitFor();
const depth0 = await q.evaluate(() => history.length);

// profile -> class -> coach name -> class -> coach name
for (let i = 0; i < 3; i++) {
  await q.locator(".ps-event").first().click();
  await q.waitForURL(/\/sarah\/[0-9a-f-]{36}/);
  await q.locator(".evcoach").waitFor();
  await q.waitForTimeout(350);
  await q.locator(".evcoach").click();
  await q.waitForURL(/\/sarah(\/schedule)?$/);
  await q.locator(".ps-event").first().waitFor();
  await q.waitForTimeout(350);
}
const depth1 = await q.evaluate(() => history.length);
console.log(`history after three round trips: ${depth0} -> ${depth1}`);
if (depth1 > depth0 + 1)
  fail(`each round trip piled onto history (${depth0} -> ${depth1}); back can never escape`);

// And one back tap from the profile leaves the coach entirely, rather than
// dropping onto the class page again.
await q.goBack();
await q.waitForTimeout(700);
if (/\/sarah\/[0-9a-f-]{36}/.test(q.url()))
  fail(`back from the profile landed on a class page again: ${q.url()}`);
console.log("back from the profile leaves, it doesn't bounce ok");

// The in-app back arrow on a class page pops too.
await q.goto(BASE + "/sarah/schedule");
await q.locator(".ps-event").first().waitFor();
await q.locator(".ps-event").first().click();
await q.waitForURL(/\/sarah\/[0-9a-f-]{36}/);
await q.waitForTimeout(350);
await q.locator(".evback").click();
await q.waitForURL(/\/sarah(\/schedule)?$/);
await q.waitForTimeout(400);
// history.length never shrinks on a back, so the honest test is whether there
// is anything to go forward to: only a pop leaves the class page ahead of you.
await q.goForward();
await q.waitForTimeout(700);
if (!/\/sarah\/[0-9a-f-]{36}/.test(q.url()))
  fail(`the back arrow pushed instead of popping: forward went to ${q.url()}`);
await q.goBack();
await q.waitForTimeout(700);
console.log("the class page back arrow pops ok");

// A class page opened cold has nothing beneath it, so its back arrow has to
// push rather than dropping the visitor out of the app.
const cold = await b.newContext({ viewport: { width: 390, height: 844 } });
const r = await cold.newPage();
r.setDefaultTimeout(15000);
await q.goto(BASE + "/sarah/schedule");
await q.locator(".ps-event").first().click();
await q.waitForURL(/\/sarah\/[0-9a-f-]{36}/);
const classUrl = q.url();
await r.goto(classUrl);
await r.locator(".evback").waitFor();
await r.waitForTimeout(400);
await r.locator(".evback").click();
await r.waitForURL(/\/sarah(\/schedule)?$/);
await r.locator(".ps-event").first().waitFor();
console.log("a cold class page still gets to the profile ok");

await b.close();
console.log("NAV CHECKS PASSED");
