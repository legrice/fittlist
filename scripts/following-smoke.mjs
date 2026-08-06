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
    await p.locator(".wkempty-cta, .calbar-add").first().click();
    // The stepped adder: studio, then the class list, then the form. The
    // list waits for typing now, so the name goes in first.
    await p.locator(".stepline", { hasText: "Choose the studio" }).waitFor();
    await p.getByLabel("Search studios").fill(studio);
    const existing = p.locator(".studio-row", { hasText: studio });
    if (await existing.count()) {
      await existing.first().click();
      await p.getByRole("button", { name: "+ New class" }).click();
    } else {
      await p.getByRole("button", { name: "+ New studio" }).click();
      await p.getByPlaceholder("e.g. Palisade Barbell").fill(studio);
      await p.getByPlaceholder("e.g. 501 Palisade Ave, Jersey City").fill("9 Bloomfield Ave, Montclair NJ");
      await p.getByRole("button", { name: "Add studio" }).click();
    }
    await p.getByPlaceholder("e.g. Barbell Strength").fill(nm);
    await p.getByRole("button", { name: day, exact: true }).click();
    await p.locator("#fStart").fill(t);
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

// The first follow happens in the sheet, which is the sheet's whole reason
// for existing: the empty state's own button opens it, you follow somebody in
// it, and closing brings the week behind it up to date. A page that stayed
// empty after three follows would read as a follow that did nothing.
await m.locator(".wkempty-cta", { hasText: "Find coaches" }).click();
await m.locator(".dissheet").waitFor();
await m.waitForTimeout(900);
await m.locator(".dissheet .disrow", { hasText: "Nadia Haq" }).getByRole("button").first().click();
await m.waitForTimeout(700);
await m.locator(".dissheet .sheetclose").click();
await m.locator(".tray").waitFor({ timeout: 15000 });
console.log("followed from the sheet, and the week behind it caught up on close");

for (const h of ["theolang", "quinnreyes"]) {
  await m.goto(BASE + "/" + h);
  await m.getByRole("button", { name: "Follow", exact: true }).first().click();
  await m.waitForTimeout(500);
}

await m.goto(BASE + "/feed");
await m.locator(".tray").waitFor();
await m.waitForTimeout(600);
{
  const faces = (await m.locator(".trayitem-nm").allInnerTexts()).map((t) => t.trim());
  console.log("rail:", faces.join(" | "));
  if (faces.includes("Quinn")) fail("a coach with nothing up should not be on the rail");
  if (!faces.includes("Nadia") || !faces.includes("Theo"))
    fail("both coaches with classes should be on the rail: " + faces.join());
  // Soonest first, not alphabetical: a rail is read left to right and only its
  // first few faces are seen without a swipe, so the one in front is whoever
  // is teaching next. Checked against the list rather than a fixed order,
  // because which coach that is depends on the day the suite runs.
  await m.locator(".clline").first().waitFor();
  // The name is the by-line's last text node: the avatar's initials are a
  // text node too, so `innerText` reads "TL Theo Lang" and splitting it hands
  // back the initials. `series-smoke` learned this exact lesson once already.
  const next = (
    await m.locator(".clline-by").first().evaluate((e) => e.lastChild.textContent)
  ).trim().split(/\s+/)[0];
  console.log("next class is", next, "| rail leads with", faces[1]);
  if (faces[1] !== next) fail(`the rail should lead with ${next}, led with ${faces[1]}`);
}
await m.screenshot({ path: (process.env.SMOKE_OUT ?? ".") + "/shot-fol-week.png" });

// The rail is chrome now: pinned under the header at the header's measured
// height, and the card slides up over it, the same model every screen wears.
{
  const pos = await m.locator(".tray").evaluate((e) => getComputedStyle(e).position);
  if (pos !== "sticky") fail("the tray should pin under the header, got " + pos);
  const barH = await m.locator(".brandbar").evaluate((e) => e.offsetHeight);
  const top = await m.locator(".tray").evaluate((e) => parseFloat(getComputedStyle(e).top));
  console.log("tray top:", top, "| header:", barH);
  if (Math.abs(top - barH) > 2) fail(`the tray pins at the header's height: ${top} vs ${barH}`);
  const deep = await m.evaluate(() => {
    window.scrollTo(0, 1e5);
    return window.scrollY;
  });
  await m.waitForTimeout(300);
  if (deep > 40) {
    const tray = await m.locator(".tray").boundingBox();
    if (Math.abs(tray.y - barH) > 3)
      fail(`scrolled ${deep}, the tray should stay pinned under the header, at ${tray.y}`);
    console.log("scrolled " + deep + ": tray pinned at " + Math.round(tray.y));
  }
  await m.evaluate(() => window.scrollTo(0, 0));
}

// One list of what is coming, under date headings, rather than a week you flip
// through. All four classes are in it: this week's remainder plus next week's.
await m.locator(".clline").first().waitFor();
const rowsAll = await m.locator(".clline").count();
const heads = (await m.locator(".dayband-d").allInnerTexts()).map((t) => t.trim());
console.log("coming up rows:", rowsAll);
console.log("headings:", heads.join(" | "));
if (heads.length < 2) fail("expected a heading per day, got " + heads.join());
// One wording for every band: weekday, dash, date. "Today" and "Tomorrow" led
// their own for a long time, which made two bands out of a fortnight read
// differently from the rest and the column of dates impossible to scan. The
// dot on today says it instead.
for (const h of heads)
  if (!/^[A-Z][a-z]{2} \u2014 [A-Z][a-z]{2} \d{1,2}$/.test(h))
    fail("every band reads the same way, got " + h);
if (await m.locator(".wkarrow").count()) fail("Following is a list, so it has no week arrows");
// No title and no count. "Coming up" said what the date headings say, and the
// line under it counted the classes the rows are already showing: arithmetic
// the list was doing at somebody who can see the list.
if (await m.locator(".wkhead").count()) fail("Following carries no header block");
if (await m.locator(".wkhead-sum").count()) fail("no count of classes and coaches");

// The rail filters, single select, and the list gets shorter.
await m.locator(".trayitem", { hasText: "Nadia" }).click();
await m.waitForTimeout(400);
const rowsOne = await m.locator(".clline").count();
console.log("filtered rows:", rowsOne, "of", rowsAll);
if (!(rowsOne > 0 && rowsOne < rowsAll)) fail("picking a face should narrow the list");
// ...and says whose week it is, with the door to them. A filtered list is
// otherwise indistinguishable from a quiet one: five faces with a ring on one,
// and a shorter list under them for somebody to infer.
{
  const bar = (await m.locator(".focusbar-t").innerText()).trim();
  const href = await m.locator(".focusbar-a").getAttribute("href");
  console.log("focus bar:", bar, "->", href);
  if (!/^Classes with Nadia$/.test(bar)) fail("the bar should name the coach: " + bar);
  if (!href?.startsWith("/nadiahaq")) fail("View profile should open them, got " + href);
}
if (!(await m.locator(".trayav.sel").count())) fail("the picked face should wear the ring");
if (!(await m.locator(".trayitem.dim").count())) fail("the others should step back");
await m.screenshot({ path: (process.env.SMOKE_OUT ?? ".") + "/shot-fol-filtered.png" });

// Tapping again gives everyone back.
await m.locator(".trayitem", { hasText: "Nadia" }).click();
await m.waitForTimeout(400);
if ((await m.locator(".clline").count()) !== rowsAll)
  fail("tapping the picked coach again should clear the filter");
// With everyone showing there is nothing to name and no single profile to
// open, so the bar goes.
if (await m.locator(".focusbar").count()) fail("no focus bar with everyone showing");

// Search is Following's floating orange circle again: the dock's own circle
// was tried and reverted by Matt after living with it.
{
  if (await m.locator(".navfind, .navdock").count())
    fail("the dock's search circle should be gone again");
  if (await m.locator('.navtab[data-tab="find"]').count())
    fail("the Search tab should stay gone from the pill");
  if (!(await m.locator('.navtab[data-tab="share"]').count()))
    fail("Share should be a tab in the bar");
  const fab = m.locator(".wkfab-find");
  if (!(await fab.count())) fail("the floating search circle should be back");
  const bg = await fab.evaluate((e) => getComputedStyle(e).backgroundColor);
  if (bg !== "rgb(194, 65, 12)") fail("the circle wears the brand fill, got " + bg);
}

// The circle pulls the directory up over the week rather than navigating to
// it, and comes back down onto the list you were reading.
await m.locator(".wkfab-find").click();
await m.locator(".dissheet").waitFor();
await m.waitForTimeout(900);
{
  const names = (await m.locator(".dissheet .disrow .nm").allInnerTexts()).map((t) => t.trim());
  console.log("discover sheet:", names.join(" | ") || "(empty)");
  if (!names.includes("Nadia Haq")) fail("the directory should list the coaches: " + names.join());
  if (!m.url().endsWith("/feed")) fail("the sheet should not navigate, at " + m.url());
  // Nothing runs off the side. The chip rail bleeds to the window with
  // `calc(50% - 50vw)` on the page, which inside a sheet is the wrong window:
  // it reached past the sheet's own padding on both edges and took the whole
  // sheet sideways with it.
  const over = await m.locator(".dissheet").evaluate((e) => e.scrollWidth - e.clientWidth);
  const body = await m.evaluate(() => document.body.scrollWidth - document.body.clientWidth);
  console.log("sheet overflow:", over, "| body:", body);
  if (over > 1) fail("the sheet scrolls sideways by " + over + "px");
  if (body > 1) fail("the page behind it scrolls sideways by " + body + "px");
}
await m.locator(".dissheet .sheetclose").click();
await m.waitForTimeout(300);
if (await m.locator(".dissheet").count()) fail("the close should put it away");

// A class opens as the classic viewer in a sheet: the facts with their
// glyphs, the by-line, and the pinned footer, all at once rather than a
// summary with the depth a tap behind it.
await m.locator(".clline").first().click();
await m.locator(".clspeek").waitFor();
await m.waitForTimeout(700);
const factRows = await m.locator(".clsfull-fact .t").allInnerTexts();
console.log("sheet:", (await m.locator(".clspeek-nm").innerText()).trim(), "|", factRows.join(" / "));
// The date leads the facts, because which day is the first thing checked.
if (!/[A-Z][a-z]+, [A-Z]/.test(factRows[0] ?? ""))
  fail("the date should lead the facts: " + factRows.join());
{
  const by = (await m.locator(".clspeek-by").innerText()).trim();
  const href = await m.locator("a.clspeek-by").getAttribute("href");
  console.log("by-line:", by, "->", href);
  if (!href || href === "/") fail("the by-line should open their week, got " + href);
  // The studio is a door too, and the two are the ways out of this sheet.
  const st = await m.locator(".clspeek-door").getAttribute("href");
  console.log("studio door:", st);
  if (!/^\/s\//.test(st ?? "")) fail("the studio should open its page, got " + st);
}
if (await m.locator(".clspeek-del").count()) fail("no delete on a class that is not yours");
// The footer: Share in ink, and no Book on a class with no booking link.
{
  if (!(await m.locator(".clsfull-btn.dark", { hasText: "Share" }).count()))
    fail("expected the ink Share in the footer");
  if (await m.locator(".clsfull-btn.book").count())
    fail("no Book on a class without a booking link");
  if (await m.locator(".clspeek-btn", { hasText: "Full details" }).count())
    fail("the depth is the sheet now, not a button");
  console.log("classic viewer: facts, by-line, and a Share-only footer");
}
// The X pins: the sheet is its own scroller, and the one way off it has to
// stay under the thumb when a long class scrolls. Sticky, so its top edge
// holds still while the content underneath it moves.
{
  const sheet = m.locator(".sheet.clspeek.clsfull");
  const before = await m.locator(".clsfull-x").boundingBox();
  await sheet.evaluate((e) => { e.scrollTop = 300; });
  await m.waitForTimeout(250);
  const after = await m.locator(".clsfull-x").boundingBox();
  console.log("x pinned:", Math.round(before.y), "->", Math.round(after.y));
  if (Math.abs(after.y - before.y) > 30)
    fail(`the close should stay pinned through a scroll: ${before.y} -> ${after.y}`);
  await sheet.evaluate((e) => { e.scrollTop = 0; });
}
// Share always ends somewhere: no tray in this browser, so the clipboard
// takes it and the toast says so. Silence here is what reads as a dead
// button.
await m.locator(".clsfull-btn.dark", { hasText: "Share" }).click();
await m.locator(".toast.on").waitFor({ timeout: 5000 });
console.log("share toast:", (await m.locator(".toast").innerText()).trim());
await m.screenshot({ path: (process.env.SMOKE_OUT ?? ".") + "/shot-fol-sheet.png" });

await m.locator(".clspeek-x").click();
await m.waitForTimeout(300);

await b.close();
console.log("ALL FOLLOWING CHECKS PASSED");
