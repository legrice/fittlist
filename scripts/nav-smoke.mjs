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

// The just-published share sheet rides every brand new public class now.
// Close it when it appears so the flow underneath can carry on.
const closeLive = async (pg) => {
  const sheet = pg.locator(".sheet", { hasText: "Your class is live" });
  try { await sheet.waitFor({ timeout: 4000 }); } catch { return; }
  await sheet.locator(".sheetclose").click();
  await pg.waitForFunction(() => !document.querySelector(".sheet-scrim"));
};
await p.locator(".publishwrap .btn").click();
await p.waitForTimeout(900);
await closeLive(p);
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

// Tapping a class opens a sheet, so the round trip that used to pile up history
// doesn't happen at all: you never leave the schedule. Three opens and closes
// should leave history exactly where it started.
for (let i = 0; i < 3; i++) {
  await q.locator(".ps-event").first().click();
  await q.locator(".classoverlay-nm").waitFor();
  await q.locator(".ovcircle-back").click();
  await q.waitForFunction(() => !document.querySelector(".classoverlay"));
  await q.waitForTimeout(200);
}
const depth1 = await q.evaluate(() => history.length);
console.log(`history after three opens: ${depth0} -> ${depth1}`);
if (depth1 !== depth0)
  fail(`opening a class as a sheet should not touch history (${depth0} -> ${depth1})`);
if (!/\/sarah\/schedule$/.test(q.url())) fail(`the sheet navigated: ${q.url()}`);
console.log("a class opens over the schedule, history untouched ok");

// The class page still exists for a link somebody was sent, and its back arrow
// still has to pop when the profile is the page beneath it.
await q.goto(BASE + "/sarah/schedule");
await q.locator(".ps-event").first().waitFor();
{
  const href = await q.locator(".ps-event").first().getAttribute("href");
  await q.goto(BASE + href);
}
await q.waitForURL(/\/sarah\/[0-9a-f-]{36}/);
await q.waitForTimeout(350);
await q.locator(".ovcircle-back").click();
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
// One retry: under suite load the load event has been seen to straggle
// past the timeout while the page itself is fine (same precedent as the
// member suite's /you arrival). A second try that also hangs is a real
// failure.
try {
  await q.goto(BASE + "/sarah/schedule");
} catch {
  console.log("goto /sarah/schedule straggled; retrying once");
  await q.goto(BASE + "/sarah/schedule");
}
{
  const href = await q.locator(".ps-event").first().getAttribute("href");
  await q.goto(BASE + href);
}
await q.waitForURL(/\/sarah\/[0-9a-f-]{36}/);
const classUrl = q.url();
await r.goto(classUrl);
await r.locator(".ovcircle-back").waitFor();
await r.waitForTimeout(400);
await r.locator(".ovcircle-back").click();
await r.waitForURL(/\/sarah(\/schedule)?$/);
await r.locator(".ps-event").first().waitFor();
console.log("a cold class page still gets to the profile ok");

// The one pair able to trap somebody: a class and the profile it belongs to
// link at each other, so a profile that popped into one of its own classes
// would bounce forever. Open a class link cold, tap through to the coach, tap
// back, and you have to be somewhere other than that class.
{
  const trapCtx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const t = await trapCtx.newPage();
  t.setDefaultTimeout(15000);
  await t.goto(classUrl);
  await t.locator(".classoverlay-nm").waitFor();
  await t.waitForTimeout(500);
  // Into the coach, the way the class offers.
  const coach = t.locator(".classoverlay a[href^='/sarah']").first();
  if (!(await coach.count())) fail("a class should name the coach it belongs to");
  await coach.click();
  await t.waitForURL(/\/sarah$/);
  await t.locator(".pubhead").waitFor();
  await t.waitForTimeout(500);
  await t.locator(".profback .evback").click();
  await t.waitForTimeout(1100);
  if (/\/sarah\/[0-9a-f-]{36}/.test(t.url()))
    fail("the profile popped back into its own class: that is the loop");
  if (!/\/(feed|discover)?$/.test(new URL(t.url()).pathname))
    fail("a profile with nowhere real behind it should reach the app, got " + t.url());
  await trapCtx.close();
}
console.log("no class/profile loop ok (a profile never pops into its own class)");

await b.close();
console.log("NAV CHECKS PASSED");
