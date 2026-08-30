// Run the server with INVITE_ONLY=false for this suite: it exercises the full
// self-serve signup flow, which the invite-only beta gate would otherwise
// block. The gate itself is covered by scripts/invite-smoke.mjs.
import { chromium } from "playwright";
import { fillLocation, skipSetup } from "./lib/wizard.mjs";
import fs from "fs";

const SCRATCH = process.env.SMOKE_OUT ?? ".";
const BASE = "http://localhost:3000";

const fail = (msg) => { throw new Error("SMOKE FAIL: " + msg); };
// The directory opens on Coaches, so anything asserting on the Classes or
// Studios rows picks its half first. The tabs carried a count under the label
// for a while, which made an exact match on the bare word find nothing; the
// counts are gone but this stays a hasText match scoped to the tab row, since
// that is right either way and the count may earn its place back.
// Discover is one list now, so there is no half to pick: this is just the
// door, kept as a helper because every caller used to need the second tap.
const discHalf = async (p) => {
  await p.goto(BASE + "/discover");
  await p.locator(".dislist").waitFor();
};
const expect = async (cond, msg) => { if (!(await cond)) fail(msg); };
const readLog = () => fs.readFileSync(process.env.SERVER_LOG ?? (SCRATCH + "/server.log"), "utf8");
const cardCount = (pg) => pg.locator(".ps-card").count();

// The just-published share sheet rides every brand new public class now.
// Close it when it appears so the flow underneath can carry on.
const closeLive = async (pg) => {
  const sheet = pg.locator(".sheet", { hasText: "Your class is live" });
  try { await sheet.waitFor({ timeout: 4000 }); } catch { return; }
  await sheet.locator(".sheetclose").click();
  await pg.waitForFunction(() => !document.querySelector(".sheet-scrim"));
};
// A followed coach's classes live behind their circle now, not on a merged
// week. Open the peek and wait for it to have rows; close it the same way
// everywhere so the screen underneath is never left scrimmed.
const openPeek = async (pg, first) => {
  await pg.locator(".tray").waitFor();
  await pg.locator(".trayitem", { hasText: first }).click();
  await pg.locator(".peeksheet").waitFor();
  await pg.locator(".peekrow").first().waitFor();
};
const shutPeek = async (pg) => {
  await pg.locator(".peekclose").click();
  await pg.waitForFunction(() => !document.querySelector(".sheet-scrim"));
};
const eventCount = (pg) => pg.locator(".ps-event").count();
// The schedule is an infinite calendar: a class recurs across many weeks, so
// count DISTINCT classes by their data-cid rather than rendered rows.
const scheduleClasses = (pg) =>
  pg.evaluate(() =>
    new Set([...document.querySelectorAll(".ps-event[data-cid]")].map((e) => e.getAttribute("data-cid"))).size,
  );
const waitSchedule = (pg, n, timeout = 10000) =>
  pg.waitForFunction(
    (k) =>
      new Set([...document.querySelectorAll(".ps-event[data-cid]")].map((e) => e.getAttribute("data-cid")))
        .size === k,
    n,
    { timeout },
  );
// The account page. The header gear is gone, so this is the URL the profile's
// own gear links to. A navigation rather than a local open, so the rows need a
// beat to hydrate before a click lands on one.
const openProfile = async (pg) => {
  await pg.goto(BASE + "/you");
  await pg.locator(".acctwrap").waitFor();
  await pg.waitForTimeout(450);
};
// A tab is not a thing you close: leaving the account is going somewhere.
// The settings reorg put every leaf behind one of four rows, so opening one
// is two taps: the group, then the row inside its sheet.
const openSetting = async (pg, group) => {
  // A sheet from the previous step may still be up, and a sheet holds a
  // .settingslist of its own, so the group row has to be reached with
  // nothing over it or the selector matches the wrong list.
  for (let i = 0; i < 3; i++) {
    if (!(await pg.locator(".sheet").count())) break;
    await pg.locator(".sheet .sheetclose, .sheet .sheetback").first().click().catch(() => {});
    await pg.waitForTimeout(350);
  }
  await pg.locator(".settingslist .setrow", { hasText: group }).first().click();
  await pg.waitForTimeout(450);
};

const closeProfile = async (pg) => {
  await pg.goto(BASE + "/app");
  await pg.locator(".caladd").waitFor();
};

// The plus asks which hat now, so opening the coach's form is two taps.
const openCoachAdder = async (pg) => {
  await pg.locator(".caladd").click();
  await pg.getByRole("heading", { name: "Add to your calendar" }).waitFor();
  await pg.locator(".sheet .setrow", { hasText: "coaching" }).click();
};

// Studio-first: pick the studio, then reuse a class from that studio's shared
// catalog via the class-name field.
const addSaved = async (pg) => {
  await openCoachAdder(pg);
  await pg.getByRole("heading", { name: "New class" }).waitFor();
  await pg.getByRole("button", { name: "Select or start typing a studio" }).click();
  await pg.getByRole("heading", { name: "Choose a studio" }).waitFor();
  await pg.locator(".studio-row", { hasText: "Ironbound Strength" }).first().click();
  await pg.locator(".studio-sel .nm", { hasText: "Ironbound Strength" }).waitFor();
  await pg.locator("#fName").click();
  await pg.locator(".namesug button", { hasText: "Barbell Strength" }).first().click();
  await pg.waitForFunction(() => {
    const t = document.querySelector("#fName");
    return t && t.value === "Barbell Strength";
  });
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.setDefaultTimeout(10000);

// ---- auth: sign up with email (bottom sheet) -> biometric prompt -> pick URL
await page.goto(BASE + "/");
// with the member side live the landing has to speak to both, not just coaches
await expect(page.getByText("Find your fit").isVisible(), "landing headline visible");
// signing up and logging in sit together; everything else is below them.
// (The invite queue is only rendered when INVITE_ONLY is on, which this suite
// turns off, so its position is checked in invite-smoke instead.)
{
  const order = await page.evaluate(() => {
    const y = (sel) => document.querySelector(sel)?.getBoundingClientRect().top ?? null;
    return { signup: y(".ob .btn"), login: y(".obloginlink") };
  });
  if (!(order.signup !== null && order.login !== null && order.signup < order.login))
    fail(`log in should sit right under sign up: ${JSON.stringify(order)}`);
}
await page.getByRole("button", { name: "Sign up with email" }).click();
await page.getByRole("heading", { name: "Sign up with email" }).waitFor();
await page.getByPlaceholder("you@example.com").fill("matt@example.com");
await page.getByPlaceholder("Password").fill("smoke-pass-123");
await page.getByRole("button", { name: "Create account" }).click();
// biometric enrollment prompt appears after a password sign-in
await page.getByRole("heading", { name: "Sign in faster next time?" }).waitFor();
await page.getByRole("button", { name: "Not now" }).click();
await page.getByText("Pick your link.").waitFor();
console.log("password sign-up ok");
await page.getByPlaceholder("Your name").fill("Matt");
await expect(page.getByText("fittlist.co/matt").isVisible(), "URL preview shows fittlist.co/matt");
await page.getByRole("button", { name: "Claim it" }).click();

// ---- setup wizard (photo -> info -> studios), skippable. Skip it and confirm
// we land on the blank schedule with the add button (no auto-opened adder).
await page.getByRole("heading", { name: "Add a photo." }).waitFor();
await skipSetup(page);
await page.getByRole("heading", { name: "Your week is wide open" }).waitFor();
if (!(await page.locator('.appshell[data-theme="poster"]').count())) fail("app should be Poster");
console.log("setup wizard skippable, blank schedule ok");

// open the adder from the empty state
await page.getByRole("button", { name: "Add your first class" }).click();
await page.getByRole("heading", { name: "New class" }).waitFor();
console.log("adder opens from empty state");

await page.getByPlaceholder("e.g. Barbell Strength").fill("Barbell Strength");
await page.locator("#fType").selectOption("Strength");
await page.locator("#fDesc").fill("Barbell club for all levels. Bring a belt.");
await page.getByRole("button", { name: "Mo", exact: true }).click();
await page.getByRole("button", { name: "We", exact: true }).click();

// studio-first: pick the studio (create it in the shared directory)
await page.getByRole("button", { name: "Select or start typing a studio" }).click();
await page.getByRole("heading", { name: "Choose a studio" }).waitFor();
await page.getByRole("button", { name: "+ New studio" }).click();
await page.getByPlaceholder("e.g. Palisade Barbell").fill("Ironbound Strength");
await page.getByPlaceholder("e.g. 501 Palisade Ave, Jersey City").fill("143 Newark Ave, Jersey City");
await page.getByRole("button", { name: "Add studio" }).click();
await page.getByText("Added to the studio directory").waitFor();

await page.getByRole("button", { name: "+ Add link" }).click();
await page.getByPlaceholder("Paste a link").fill("https://example.com/book");
await expect(page.locator(".linktag", { hasText: "Website" }).isVisible(), "booking link auto-tagged");

// start/end behave like a calendar event: nudging start slides end (length holds)
const mins = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const endBefore = await page.locator("#fEnd").inputValue();
await page.locator("#fStart").fill("07:00");
const endAfter = await page.locator("#fEnd").inputValue();
if (mins(endAfter) - mins(endBefore) !== 60)
  fail(`start change should slide end +60m: ${endBefore} -> ${endAfter}`);
await page.locator("#fStart").fill("06:00"); // restore for the 6:00a label assertion
console.log("start slides end ok");

// publish CTA is just "Publish event" (no day/time details)
const label = (await page.locator(".publishwrap .btn").textContent()).trim();
console.log("publish label:", label);
if (label !== "Publish event") fail("publish CTA wrong: " + label);
await page.locator(".publishwrap .btn").click();
await page.getByText("Your page is live").waitFor();
// The share moment: a brand new public class offers its two hand-ons, the
// link to a person and the picture to a story, before the sheet is closed.
{
  const sheet = page.locator(".sheet", { hasText: "Your class is live" });
  await sheet.waitFor();
  await sheet.locator(".setrow", { hasText: "Share the link" }).waitFor();
  await sheet.locator(".setrow", { hasText: "Share a picture" }).waitFor();
}
await closeLive(page);
console.log("class live sheet ok (two shares, told apart)");
await waitSchedule(page, 2);
await page.screenshot({ path: SCRATCH + "/shot-poster-schedule.png" });
console.log("first publish ok");

// ---- steady-state: fab -> pick saved class from the name field -> day -> publish
await addSaved(page);
await page.getByRole("button", { name: "Fr", exact: true }).click();
await page.locator(".publishwrap .btn").click();
await page.getByText("Published", { exact: false }).waitFor();
await closeLive(page);
await waitSchedule(page, 3);
console.log("saved-class flow ok");

// ---- edit in place: tap the Monday class, prefilled with its day, no new class
await page.locator(".ps-daygroup", { hasText: "MON" }).first().locator(".ps-event").first().click();
await page.getByRole("heading", { name: "Edit class" }).waitFor();
const editLabel = (await page.locator(".publishwrap .btn").textContent()).trim();
if (editLabel !== "Save changes") fail("edit save button should say Save changes: " + editLabel);
// the tapped class's recurring day is prefilled (Monday pill selected)
if (!(await page.locator(".daypick button.sel", { hasText: "Mo" }).count()))
  fail("edit not prefilled with its recurring day");
// class type round-trips: the Type dropdown shows Strength on edit
if ((await page.locator("#fType").inputValue()) !== "Strength")
  fail("class type did not persist (Strength) on edit");
// change the class length by moving the End time (start is 6:00a → 75 min)
await page.locator("#fEnd").fill("07:15");
await expect(page.locator(".durnote", { hasText: "75 min" }).isVisible(), "durnote reflects end time");
await page.locator(".publishwrap .btn").click();
await page.getByText("Saved", { exact: true }).waitFor();
await waitSchedule(page, 3, 20000);
// Editing a weekly class recreates its rows with new ids via router.refresh();
// let that settle so the delete below targets a current row, not a stale id.
await page.waitForTimeout(700);
console.log("edit ok (end-time length)");

// ---- delete lives inside the edit sheet, behind a confirmation (delete Friday)
await page.locator(".ps-daygroup", { hasText: "FRI" }).first().locator(".ps-event").first().click();
await page.getByRole("heading", { name: "Edit class" }).waitFor();
await page.getByRole("button", { name: "Delete this class" }).click();
// Barbell Strength runs Mon, Wed & Fri, so the confirm has to ask which is
// meant rather than saying "this class" and taking the whole recurring day.
await page.getByRole("heading", { name: "This class repeats" }).waitFor();
await expect(
  page
    .locator(".confirm-modal p")
    .textContent()
    .then((t) => t.includes("every Friday") && t.includes("Mon & Wed")),
  "the repeat confirm names the day you opened and the others it runs",
);
if (!(await page.getByRole("button", { name: "All 3 days it runs" }).count()))
  fail("a repeating class should offer deleting the whole set");
if (!(await page.getByRole("button", { name: /^Just / }).count()))
  fail("a repeating class should offer cancelling the single date you opened");
await page.getByRole("button", { name: "Keep it" }).click(); // cancel path

// ---- one week off, without touching the weeks either side. The row is one
// class recurring across the calendar, so exactly one of its dates goes and
// the class itself stays.
{
  const fridayRow = page.locator(".ps-daygroup", { hasText: "FRI" }).first().locator(".ps-event").first();
  const cid = await fridayRow.getAttribute("data-cid");
  const iso = await fridayRow.getAttribute("data-d");
  const at = (d) => page.locator(`.ps-event[data-cid="${cid}"][data-d="${d}"]`);
  // The week after and the week before the one being cancelled, so the check
  // is that exactly one date came off rather than that the class did.
  const shift = (days) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const nextWeek = shift(7);
  if (!(await at(iso).count())) fail("expected the Friday being cancelled to be on screen");
  if (!(await at(nextWeek).count())) fail("expected the following Friday to be on screen");
  await page.getByRole("button", { name: "Delete this class" }).click();
  await page.getByRole("button", { name: /^Just / }).click();
  await page.getByText("cancelled", { exact: false }).waitFor();
  // The date, not a row count. Counting was only ever stable because the past
  // anchored the top of the list: with the list starting at today, the forward
  // window can grow a week between the two counts and the total holds while
  // the right date has plainly gone. One occurrence off is a claim about a
  // date, so the check is about that date.
  await at(iso).waitFor({ state: "detached", timeout: 10000 }).catch(() => {
    fail(`cancelling ${iso} left it on the calendar`);
  });
  if (!(await at(nextWeek).count()))
    fail("cancelling one occurrence should leave the weeks either side alone");
  // and it's gone from the public page too: one predicate, every surface
  const pub = await (await page.request.get(`${BASE}/matt/schedule`)).text();
  const pubFridays = (pub.match(/Barbell Strength/g) || []).length;
  await page.reload();
  await page.locator(".caladd").waitFor();
  await page.locator(`.ps-event[data-cid="${cid}"]`).first().waitFor();
  if (await at(iso).count()) fail("the cancelled week came back after a reload");
  if (pubFridays === 0) fail("cancelling one week should not empty the public page");
  // the .ics tells subscribed calendars about it rather than silently differing
  const ics = await (await page.request.get(`${BASE}/api/cal/matt`)).text();
  if (!/EXDATE:\d{8}T\d{6}/.test(ics)) fail("a cancelled date needs an EXDATE in the feed");
}
console.log("cancel one occurrence ok (weeks either side survive, EXDATE in the feed)");

// The list runs its whole horizon now, no View more: this week's Friday was
// just cancelled and the next one is simply further down.
if (await page.locator(".viewmore").count())
  fail("the schedule should not ask before showing the rest of the week");
await page.locator(".ps-daygroup", { hasText: "FRI" }).first().waitFor();
// The edit step just before this can recreate rows with fresh ids mid-flight,
// so a delete can occasionally hit a stale row id. Retry the whole flow once.
await page.locator(".ps-daygroup", { hasText: "FRI" }).first().locator(".ps-event").first().click();
await page.getByRole("heading", { name: "Edit class" }).waitFor();
for (let attempt = 0; ; attempt++) {
  await page.getByRole("button", { name: "Delete this class" }).click();
  await page.getByRole("button", { name: "Every Friday" }).click();
  await page.getByText("Deleted", { exact: true }).waitFor();
  let done = false;
  try { await waitSchedule(page, 2, 8000); done = true; } catch {}
  if (!done) {
    await page.reload();
    await page.locator(".caladd").waitFor();
    done = (await scheduleClasses(page)) === 2;
  }
  if (done) break;
  if (attempt >= 1) fail("delete did not persist after retry");
  await page.locator(".ps-daygroup", { hasText: "FRI" }).first().locator(".ps-event").first().click();
  await page.getByRole("heading", { name: "Edit class" }).waitFor();
}
console.log("delete-in-sheet ok (repeat choice, one day, confirm + cancel)");

// ---- deleting the whole repeating set, on a class made for the purpose
{
  const before = await scheduleClasses(page);
  await openCoachAdder(page);
  await page.getByRole("heading", { name: "New class" }).waitFor();
  await page.getByRole("button", { name: "Select or start typing a studio" }).click();
  await page.locator(".studio-row", { hasText: "Ironbound Strength" }).first().click();
  await page.locator("#fName").fill("Temp Repeat");
  await page.getByRole("button", { name: "Tu", exact: true }).click();
  await page.getByRole("button", { name: "Th", exact: true }).click();
  await page.locator(".publishwrap .btn").click();
  await page.getByText("Published", { exact: false }).waitFor();
  await closeLive(page);
  await waitSchedule(page, before + 2, 20000);
  await page.waitForTimeout(700);

  await page.locator(".ps-event", { hasText: "Temp Repeat" }).first().click();
  await page.getByRole("heading", { name: "Edit class" }).waitFor();
  await page.getByRole("button", { name: "Delete this class" }).click();
  await page.getByRole("button", { name: "All 2 days it runs" }).click();
  await page.getByText("Deleted 2 days").waitFor();
  await waitSchedule(page, before, 20000);
  if (await page.locator(".ps-event", { hasText: "Temp Repeat" }).count())
    fail("deleting all should clear every day of the repeat");
}
console.log("delete-all ok (whole repeating set goes)");

// ---- a weekly class can stop on a date, and stops everywhere at once
{
  const before = await scheduleClasses(page);
  // an end date two weeks out, on a Tuesday class. Days are the app's days
  // (US Eastern), not UTC's: late in the evening UTC is already tomorrow, and
  // a "yesterday" computed there is the app's today, which is a legal end.
  const appToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const end = new Date(`${appToday}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 14);
  const endIso = end.toISOString().slice(0, 10);
  const past = new Date(`${appToday}T00:00:00Z`);
  past.setUTCDate(past.getUTCDate() - 1);

  await openCoachAdder(page);
  await page.getByRole("heading", { name: "New class" }).waitFor();
  await page.getByRole("button", { name: "Select or start typing a studio" }).click();
  await page.locator(".studio-row", { hasText: "Ironbound Strength" }).first().click();
  await page.locator("#fName").fill("Six Week Block");
  await page.getByRole("button", { name: "Tu", exact: true }).click();
  await page.getByRole("button", { name: "+ Add an end date" }).click();
  // a date already gone is refused rather than silently stored
  await page.locator("#fEndsOn").fill(past.toISOString().slice(0, 10));
  await page.locator(".publishwrap .btn").click();
  await page.getByText("already passed").waitFor();
  await page.locator("#fEndsOn").fill(endIso);
  await page.locator(".publishwrap .btn").click();
  await page.getByText("Published", { exact: false }).waitFor();
  await closeLive(page);
  await waitSchedule(page, before + 1, 20000);
  await page.waitForTimeout(700);

  // it shows now, and stops after the end date: the schedule runs a year out.
  const rows = await page
    .locator('.ps-daygroup .ps-event:has-text("Six Week Block")')
    .count();
  if (rows < 1) fail("a class with an end date should still show before it");
  if (rows > 3) fail(`a class ending in 2 weeks showed ${rows} times`);
  // and the .ics carries the same stop, so subscribed calendars agree
  const ics = await (await page.request.get(`${BASE}/api/cal/matt`)).text();
  if (!ics.includes(`UNTIL=${endIso.replace(/-/g, "")}T235959Z`))
    fail("the calendar feed should carry the end date as UNTIL");

  // the end date round-trips into the editor
  await page.locator('.ps-event:has-text("Six Week Block")').first().click();
  await page.getByRole("heading", { name: "Edit class" }).waitFor();
  if ((await page.locator("#fEndsOn").inputValue()) !== endIso)
    fail("the end date did not round-trip into the editor");
  await page.getByRole("button", { name: "Delete this class" }).click();
  // a standing class that only runs one weekday still splits two ways: this
  // week off, or the Tuesday itself gone. There's no third "all days" option.
  if (await page.getByRole("button", { name: /days it runs/ }).count())
    fail("a one-weekday class has no whole-set option to offer");
  await page.getByRole("button", { name: "Every Tuesday" }).click();
  await page.getByText("Deleted", { exact: true }).waitFor();
  await waitSchedule(page, before, 20000);
}
console.log("end date ok (stops the week and the feed, round-trips)");

// ---- picking a saved class brings that coach's booking links with it
{
  await openCoachAdder(page);
  await page.getByRole("heading", { name: "New class" }).waitFor();
  await page.getByRole("button", { name: "Select or start typing a studio" }).click();
  await page.locator(".studio-row", { hasText: "Ironbound Strength" }).first().click();
  await page.locator("#fName").click();
  await page.locator(".namesug button", { hasText: "Barbell Strength" }).first().click();
  await page.locator(".linkrow input").first().waitFor();
  const url = await page.locator(".linkrow input").first().inputValue();
  if (!url.includes("example.com/book"))
    fail("a saved class should bring its booking link: " + url);
  await page.locator(".adderclose").click();
  await page.waitForFunction(() => !document.querySelector(".sheet"));
}
console.log("saved-class links carry over ok");

// ---- the account: the You tab, a page of its own. An old ?acct=1 link (the
// gear's href for months) still lands on it.
await expect(
  page.locator(".brandbar-actions .usericon .usericon-initial").filter({ hasText: "M" }).isVisible(),
  "the You tab carries their face (initial fallback)",
);
await page.goto(BASE + "/app?acct=1");
await page.waitForURL("**/you");
await page.locator(".acctwrap").waitFor();
// The tab bar already says You; the page leads with the face row, no heading.
if (await page.locator(".calbar-title", { hasText: "You" }).count())
  fail("the You heading should be gone from the You tab");
await expect(page.locator(".acctwho .acctwho-nm", { hasText: "Matt" }).isVisible(), "the who row shows their name");
if ((await page.locator(".acctstats .acctstat").count()) !== 3) fail("expected three analytics stats");
if (await page.getByText("Schedule opens").count()) fail("Schedule opens should be gone");
// Three counts of people, every one of them a door to the list it counts.
// Profile views left: it was the only number here with nowhere to go.
if (await page.getByText("Profile views").count()) fail("Profile views should be off the You tab");
await expect(page.locator(".acctstats button.acctstat", { hasText: "Following" }).isVisible(), "following stat");
await expect(page.locator(".acctstats button.acctstat", { hasText: "Followers" }).isVisible(), "followers stat");
if ((await page.locator(".acctstats button.acctstat").count()) !== 3)
  fail("all three stats should open a list");
// Two buttons where five share tiles were.
if (await page.locator(".acctcard").count()) fail("the five share tiles should be gone");
await expect(page.locator(".acctacts .btn", { hasText: "Preview profile" }).isVisible(), "preview profile button");
await expect(page.locator(".acctacts .btn", { hasText: "Share" }).isVisible(), "share button");
await page.screenshot({ path: SCRATCH + "/shot-account.png", fullPage: true });

// ---- tap the avatar -> public profile page with owner back + edit
await page.locator(".acctwho-id").click();
await page.waitForURL("**/matt");
// Editing is one of the owner's two pills now, where a visitor sees Follow.
await expect(
  page.locator(".profacts .actpill", { hasText: "Edit profile" }).isVisible(),
  "owner Edit profile pill",
);
await page.locator(".profacts .actpill", { hasText: "Edit profile" }).click();
await page.getByRole("heading", { name: "Edit profile" }).waitFor();
await page.locator("#pTitle").fill("Strength coach");
await page.locator(".abouttext").fill("Strength coach across Jersey City.");
await page.locator("#pInstagram").fill("@mattlifts");
await page.locator("#pWebsite").fill("mattlifts.com");
await page.locator("#pEmail").fill("matt@ironbound.co");
await page.locator("#pPhone").fill("+1 555 867 5309");
// the avatar colour picker (shown only while there's no photo): pick one and
// make sure it's the colour the public page renders behind the initial
// the swatches live behind "Or pick a colour" so the form isn't a wall of dots
await page.getByRole("button", { name: "Or pick a colour" }).click();
await page.locator(".swatchgrid .swatch").first().waitFor();
const pickedColor = await page.locator(".swatchgrid .swatch").nth(23).evaluate((e) => {
  e.click();
  return getComputedStyle(e).backgroundColor;
});
await page.getByRole("button", { name: "Save profile" }).click();
await page.getByText("Profile saved").waitFor();
await page.reload();
const shownAvatar = await page
  .locator(".profav")
  .evaluate((e) => getComputedStyle(e).backgroundColor);
if (shownAvatar !== pickedColor)
  fail(`avatar colour didn't stick: picked ${pickedColor}, page shows ${shownAvatar}`);
console.log("avatar colour pick ok (persists to the public page)");
await page.waitForFunction(() => !document.querySelector(".sheet"));
await page.screenshot({ path: SCRATCH + "/shot-poster-mypage.png", fullPage: true });
// no back control on the profile any more; settings is a route away
await page.goto(BASE + "/app?acct=1");
await page.locator(".acctwrap").waitFor();
await closeProfile(page);
console.log("account + profile edit ok (back -> account)");

// ---- the schedule has no pill strip: the owner's tools live behind the
// three-dot button beside their name on the profile.
await page.goto(BASE + "/app");
await page.locator(".caladd").waitFor();
if (await page.locator(".dashlinks").count()) fail("the pill strip should be gone from the schedule");
if (await page.locator(".calbar-title", { hasText: "Your schedule" }).count())
  fail("the schedule title should be gone");
// Where it is rides the row's one meta sentence now (time, length, place),
// words alone: the pin came off every schedule listing long before that.
{
  const where = page.locator(".ps-agenda .ps-emeta").first();
  await where.waitFor();
  if (await where.locator(".icon svg").count())
    fail("the map pin should be gone from schedule listings");
  const txt = await where.innerText();
  if (!/\d+ min/.test(txt)) fail("the meta line should carry the length: " + txt);
}
// The calendar's header is one sticky block: month, view, filter, Share. Add
// is back under the thumb, where the thing you open this screen to do belongs,
// and Share is back beside the filter.
if (!(await page.locator(".calsticky .calhead").count()))
  fail("the month title should sit inside the sticky calendar header");
if (!(await page.locator(".calsticky .calshare").count()))
  fail("Share should sit in the header's cluster, beside the view and filter");
if (await page.locator(".calsticky .caladd").count())
  fail("Add should have left the header for the thumb's corner");
if (!(await page.locator(".todayfab").count()))
  fail("Today should float bottom left, across from Add");
if (!(await page.locator(".caladd").count()))
  fail("Add should float bottom right, in reach");
// ...and the List holds nothing but what is coming. It grew upward as the
// scroll asked for it until the circles tray landed above it, and a list that
// grows over the faces puts the one thing a follow buys a mile up a scroll
// nobody makes. The past is still reachable, on the Month grid and in Day
// view, and neither costs a scroll.
await page.locator(".callist .ps-daygroup").first().waitFor();
if (await page.locator(".ps-pastday").count())
  fail("the List should start at today: the past belongs to Month and Day now");
{
  // Not "leads with today": it leads with the first day that still has
  // something coming, and today's six o'clock class has already run by the
  // time this suite gets here. The claim is only that nothing behind us is on
  // it, which is what the check above says and this one dates.
  const firstIso = await page.locator(".callist .ps-event[data-d]").first().getAttribute("data-d");
  const today = new Date().toLocaleDateString("en-CA");
  if (!firstIso || firstIso < today)
    fail(`the List should start no earlier than today, got ${firstIso}`);
}
console.log("sticky header ok (the List starts at today, no walk backwards)");
// The calendar's Share opens one image editor in place. Closing it keeps the
// calendar route and state; no profile card, QR or text format is mounted.
{
  const calendarUrl = page.url();
  const calendarScroll = await page.evaluate(() => window.scrollY);
  await page.locator(".calendar-header-share").click();
  const shareDialog = page.getByRole("dialog", { name: "Share" });
  await shareDialog.waitFor();
  if (page.url() !== calendarUrl) fail("calendar Share should not navigate away");
  if ((await shareDialog.locator(".shsingle-preview .shprev-week").count()) !== 1)
    fail("calendar Share should show one schedule image");
  if (await shareDialog.locator('[aria-label="What to share"], .shprev-sq, .qrcard, .shtext').count())
    fail("calendar Share should not mount alternate share formats");
  if ((await shareDialog.locator(".sheditor-dock").getByRole("button", { name: "Share image" }).count()) !== 1)
    fail("calendar Share should keep its action in the bottom editing dock");
  const tools = (await shareDialog.locator(".sheditor-tools-all .sheditor-tool-label").allInnerTexts()).map((t) => t.trim());
  if (tools.join("|") !== "Random|Background|Style|Classes|Dates|Headline")
    fail("calendar Share should put every image tool in one rail: " + tools.join("|"));
  if ((await shareDialog.locator(".sheditor-tools").count()) !== 1)
    fail("calendar Share should render one tool rail");
  if (await shareDialog.locator(".shstyle-rail, .shstyle-option").count())
    fail("calendar Share should not duplicate Style in a quick-style rail");
  await shareDialog.locator(".calendar-share-close").click();
  await shareDialog.waitFor({ state: "detached" });
  if (page.url() !== calendarUrl) fail("closing calendar Share should keep the origin route");
  const restoredScroll = await page.evaluate(() => window.scrollY);
  if (Math.abs(restoredScroll - calendarScroll) > 2)
    fail(`closing calendar Share should preserve scroll, got ${restoredScroll} from ${calendarScroll}`);
}
console.log("the calendar's Share opens one image editor in place");
// Share holds every way of sharing, and each row goes where it says
await page.goto(BASE + "/matt");
{
  const rows = (await page.locator(".ownermenu .setrow .t").allInnerTexts()).map((t) => t.trim());
  if (rows.length) fail("nothing should be open before Share is tapped");
}
await page.locator(".profacts .actpill", { hasText: "Share" }).click();
{
  const rows = (await page.locator(".ownermenu .setrow .t").allInnerTexts()).map((t) => t.trim());
  const want = [
    "Share your schedule",
    "Copy your link",
    "Your QR code",
    "Your profile card",
    "Copy your week",
  ];
  if (rows.join("|") !== want.join("|"))
    fail("the share sheet should be " + want.join(", ") + ", got " + rows.join(", "));
}
await page.locator(".ownermenu .setrow", { hasText: "Your QR code" }).click();
await page.locator(".sheet .qrframe").waitFor();
await page.locator(".sheet .sheetclose").click();
await page.waitForFunction(() => !document.querySelector(".sheet .qrframe"));
await page.locator(".profacts .actpill", { hasText: "Share" }).click();
await page.locator(".ownermenu .setrow", { hasText: "Share your schedule" }).click();
await page.locator(".sheet .storyimg").waitFor();
await page.locator(".sheet .sheetclose").click();
await page.waitForFunction(() => !document.querySelector(".sheet .storyimg"));
// Adding a class is the floating button, which is where it always was for
// anyone who didn't go looking under the dots.
await page.locator(".fab").click();
await page.waitForURL("**/app**");
await page.getByRole("heading", { name: /New class|Add a class/ }).waitFor();
await page.locator(".sheet .sheetclose, .adderclose").first().click().catch(() => {});
await page.goto(BASE + "/app");
// and the QR is still reachable from the account view
await openProfile(page);
await page.getByRole("button", { name: "Share", exact: true }).click();
await page.locator(".sheet .setrow", { hasText: "QR code" }).click();
await page.locator(".sheet .qrframe").waitFor();
await page.locator(".sheet .sheetclose").click();
await page.waitForFunction(() => !document.querySelector(".sheet"));
await closeProfile(page);
console.log("schedule tools ok (three pills, no title)");

// ---- page look: Settings changes the whole app immediately and persists the
// choice on the account. A hard reload is the important half of this check:
// it proves the server-rendered root reads the stored look rather than only a
// client class making the current screen appear to work.
await openProfile(page);
await openSetting(page, "Account & preferences");
let darkModeRow = page.locator(".sheet .setrow", { hasText: "Dark mode" });
await darkModeRow.waitFor();
if ((await darkModeRow.getAttribute("aria-pressed")) !== "false")
  fail("a new account should begin in light mode");
await darkModeRow.click();
await page.waitForFunction(() =>
  document.documentElement.dataset.mode === "dark" &&
  !!document.querySelector('.screen[data-mode="dark"], .appshell[data-mode="dark"]'),
);
await page.waitForFunction(() => {
  const row = [...document.querySelectorAll(".sheet .setrow")].find((el) =>
    el.querySelector(".t")?.textContent?.trim() === "Dark mode",
  );
  return row?.getAttribute("aria-pressed") === "true" && !row.hasAttribute("disabled");
});
if (!(await darkModeRow.locator(".s", { hasText: "On across FittList" }).count()))
  fail("the dark mode row should describe its active state");

await page.reload();
await page.locator(".acctwrap").waitFor();
if (await page.evaluate(() => document.documentElement.dataset.mode !== "dark"))
  fail("dark mode should survive a hard reload");
if (!(await page.locator('.screen[data-mode="dark"], .appshell[data-mode="dark"]').count()))
  fail("the persisted dark preference should reach the server-rendered app root");

// The preference belongs to the viewer, so it follows them onto another
// coach's public profile too.
await page.goto(BASE + "/sam");
await page.locator('.pub[data-mode="dark"]').waitFor();

// Return the fixture to light for the visual assertions that follow, and
// prove that direction persists too rather than leaving later checks coupled
// to this one.
await openProfile(page);
await openSetting(page, "Account & preferences");
darkModeRow = page.locator(".sheet .setrow", { hasText: "Dark mode" });
await darkModeRow.waitFor();
if ((await darkModeRow.getAttribute("aria-pressed")) !== "true")
  fail("Settings should read the persisted dark preference");
await darkModeRow.click();
await page.waitForFunction(() => {
  const row = [...document.querySelectorAll(".sheet .setrow")].find((el) =>
    el.querySelector(".t")?.textContent?.trim() === "Dark mode",
  );
  return !document.documentElement.dataset.mode &&
    row?.getAttribute("aria-pressed") === "false" && !row.hasAttribute("disabled");
});
await page.reload();
await page.locator(".acctwrap").waitFor();
if (await page.evaluate(() => document.documentElement.dataset.mode === "dark"))
  fail("turning dark mode off should survive a hard reload");
console.log("dark mode switches immediately and persists across FittList");

// ---- public PROFILE page (mobile): About tab (photo/name/about) + tab switcher
// The bare handle is the schedule now: it's what the link is for, and a
// half-filled About is an awkward first thing to land on.
await page.goto(BASE + "/matt");
await page.locator(".pubtab.sel", { hasText: "Schedule" }).waitFor();
if (await page.locator(".profabout").count())
  fail("the bare handle should open the schedule, not About");
await page.goto(BASE + "/matt/about");
await expect(page.locator("h1.profname", { hasText: "Matt" }).isVisible(), "profile shows name");
await expect(page.locator(".proftitle", { hasText: "Strength coach" }).isVisible(), "profile shows title");
// Location gets its own line under the name rather than being folded into the
// title as "Strength coach in Jersey City, NJ".
await expect(page.locator(".profwhere", { hasText: "Jersey City" }).isVisible(), "profile shows where");
await expect(page.getByText("Strength coach across Jersey City.").isVisible(), "profile shows about");
// Studios moved off About onto their own tab.
if (await page.locator(".coachstudio").count())
  fail("studios should have left the About tab");
await page.goto(BASE + "/matt/studios");
await expect(
  page.locator(".coachstudio", { hasText: "Ironbound Strength" }).isVisible(),
  "Studios tab lists the studio",
);
await page.goto(BASE + "/matt/about");
// The ways to reach them live behind the Contact pill now, not under the bio.
if (await page.locator(".proflink").count())
  fail("contact links belong in the Contact sheet, not on About");
// And the pill is a visitor's: the owner's two slots are Share and Edit, and
// their own contact details are in settings. What's behind it is checked from
// a visitor's side further down, once counting views is no longer at stake.
await page.goto(BASE + "/matt");
if (await page.locator(".profacts .actpill-primary", { hasText: "Contact" }).count())
  fail("the owner should not be offered a way to contact themselves");
await page.goto(BASE + "/matt/about");
if (await page.locator(".profshare").count()) fail("the profile share button should be gone");
if (await page.locator(".profacts .followpill").count())
  fail("the owner has nobody to follow on their own page");
await expect(page.locator(".pubtab", { hasText: "Info" }).isVisible(), "Info tab present");
await expect(page.locator(".pubtab.sel", { hasText: "Schedule" }).isVisible(), "unified profile starts at Schedule");
// Schedule leads: it's the thing the page exists to surface.
{
  const order = await page.locator(".pubtab").allInnerTexts();
  if (order[0].trim() !== "Schedule") fail("Schedule should lead the tabs, got " + order.join(", "));
}

await expect(
  page.locator(".profacts .actpill", { hasText: "Share" }).isVisible(),
  "owner Share pill on profile",
);
if (await page.getByText("Made with").count())
  fail("the made-with footer should be hidden from anyone signed in");
// a logged-out visitor is who it's for, so it still shows for them
{
  // A bot-flagged UA keeps this check out of the visit counts asserted later.
  const anon = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: "facebookexternalhit/1.1",
  });
  const ap = await anon.newPage();
  ap.setDefaultTimeout(10000);
  await ap.goto(BASE + "/matt");
  await ap.getByText("Made with").waitFor();
  await anon.close();
}
// the account tile offers a direct way into the editor
await openProfile(page);
await page.locator(".acctwho + .acctedit, .acctedit").first().click();
await page.locator(".editsheet, .sheet").first().waitFor();
await page.getByRole("heading", { name: "Edit profile" }).waitFor();
await page.locator(".sheet .sheetclose, .sheet .adderclose").first().click();
await page.waitForFunction(() => !document.querySelector(".sheet"));
await page.screenshot({ path: SCRATCH + "/shot-profile.png", fullPage: true });

// ---- Schedule is the first anchor on the unified profile
await page.locator(".pubtab", { hasText: "Schedule" }).click();
await page.waitForFunction(() => document.querySelector('.pub[data-theme="poster"] .ps-event'));
await expect(page.getByText("Barbell Strength").first().isVisible(), "schedule shows class");
await page.screenshot({ path: SCRATCH + "/shot-poster-public.png", fullPage: true });

// ---- the owner's tap opens the sheet, like everyone's, and the owner's copy
// carries the roster (who marked Going) and an Edit button into the editor.
await page.locator(".ps-event").first().click();
await page.locator(".classsheet-roster").waitFor();
await page.getByRole("link", { name: "Edit this class" }).click();
await page.waitForURL(/\/app/);
await page.getByRole("heading", { name: /Edit class/ }).waitFor();
await page.getByRole("button", { name: "Close", exact: true }).click().catch(() => {});
await page.locator(".adder .sheetclose, .sheetclose").first().click().catch(() => {});
await page.goto(BASE + "/matt");
await page.waitForFunction(() => document.querySelector('.pub[data-theme="poster"] .ps-event'));
console.log("owner tap opens the sheet, Edit goes to the editor ok");

// ---- for a visitor, a tap opens the class from the bottom, list still behind
{
  // Bot UA, same trick as the subscribe context: this helper visit must not
  // land in the profile-view counts asserted further down.
  const sheetCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (smoke sheet bot)",
  });
  const sp = await sheetCtx.newPage();
  sp.setDefaultTimeout(10000);
  await sp.goto(BASE + "/matt");
  await sp.locator(".ps-event").first().click();
  await sp.locator(".classoverlay").waitFor();
  // The overlay opens first and fills a beat later, so wait for the content.
  await sp.locator(".classoverlay-nm", { hasText: "Barbell Strength" }).waitFor();
  await expect(sp.getByText("143 Newark Ave, Jersey City").isVisible(), "overlay shows address");
  await expect(sp.locator(".ovcta-btn", { hasText: "Book" }).first().isVisible(), "overlay shows the Book pill");
  await expect(sp.locator(".evtype", { hasText: "Strength" }).isVisible(), "overlay shows class type");
  await expect(sp.getByText("Barbell club for all levels").isVisible(), "overlay shows description");
  // Book opens the hand-off, not the site.
  await sp.locator(".ovcta-btn", { hasText: "Book" }).click();
  await sp.getByRole("heading", { name: "Book this class" }).waitFor();
  await sp.locator(".bookout-links a", { hasText: "Book via Website" }).waitFor();
  // The corner X, like every other sheet: a worded decline was an answer to a
  // question nobody asked.
  if (await sp.getByText("Not now").count()) fail("the booking sheet still offers a worded decline");
  await sp.locator(".confirmsheet .sheetclose").click();
  await sp.waitForFunction(() => !document.querySelector(".confirmsheet"));
  // The list is still there underneath — that's the point of an overlay.
  if (!(await sp.locator(".ps-event").count())) fail("the schedule should stay behind the overlay");
  await sp.screenshot({ path: SCRATCH + "/shot-event-sheet.png" });
  await sp.locator(".ovcircle-back").click();
  await sp.waitForFunction(() => !document.querySelector(".classoverlay"));
  // The page behind the sheet is still a real URL anyone can be sent to.
  const href = await sp.locator(".ps-event").first().getAttribute("href");
  if (!href || !/\/matt\/[0-9a-f-]{36}/.test(href))
    fail("a class row should still link at its own page: " + href);
  await sp.goto(BASE + href);
  await sp.getByRole("heading", { name: "Barbell Strength" }).waitFor();
  await sheetCtx.close();
}
console.log("class sheet ok (opens over the list, the page is still shareable)");

// Subscribing is a visitor action — the owner previewing their own page never
// sees the subscribe bar, so do this from a fresh anonymous context.
{
  // A bot-flagged UA keeps this helper visit out of the profile-view counts
  // asserted below, while the subscribe form (a server action, not a page GET)
  // still records the subscription.
  const subCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (smoke subscribe bot)",
  });
  const subPage = await subCtx.newPage();
  subPage.setDefaultTimeout(10000);
  await subPage.goto(BASE + "/matt");
  // the one action lives beside the coach's name now, not in a bottom bar
  if (await subPage.locator(".notifybar").count()) fail("the subscribe bar should be gone");
  await subPage.locator(".profacts .followpill").click();
  await subPage.locator(".sheet h2", { hasText: "schedule every week" }).waitFor();
  await subPage.locator("#ntEmail").fill("fan@example.com");
  await subPage.getByRole("button", { name: "Add me to the list" }).click();
  await subPage.getByText("You're on Matt's list").waitFor();
  // They got what they came for first; the account is offered on the way out,
  // not asked for at the moment they said yes.
  // the heading uses a curly apostrophe, the toast a straight one
  await subPage.getByRole("heading", { name: /on Matt.s list/ }).waitFor();
  await expect(
    subPage.locator(".sheet .lead").textContent().then((t) => t.includes("Create an account")),
    "the account offer explains the signup payoff",
  );
  await subPage.getByRole("button", { name: "Maybe later, just email me" }).click();
  await subPage.waitForFunction(() => !document.querySelector(".sheet"));
  await expect(subPage.locator(".profacts .followpill").textContent().then((t) => t.trim() === "On the list"), "cta flips to subscribed");

  await subPage.locator(".profacts .followpill").click();
  await subPage.getByRole("button", { name: "Unsubscribe" }).waitFor();
  await subPage.locator(".sheet .sheetclose").click();
  await subPage.waitForFunction(() => !document.querySelector(".sheet"));
  await subCtx.close();
}
{
  const upCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (smoke upgrade bot)",
  });
  const up = await upCtx.newPage();
  up.setDefaultTimeout(10000);
  await up.goto(BASE + "/matt");
  await up.locator(".profacts .followpill").click();
  await up.locator("#ntEmail").fill("upgrade@example.com");
  await up.getByRole("button", { name: "Add me to the list" }).click();
  await up.locator("#ntPw").fill("upgrade-pass-123");
  await up.getByRole("button", { name: "Create my account" }).click();
  // signed in, and the subscribe they just made already reads as a follow
  await up.locator(".profacts .followpill", { hasText: "Following" }).waitFor({ timeout: 20000 });
  // ...and the follow put a face on their calendar, with the week behind it.
  await up.goto(BASE + "/week");
  await openPeek(up, "Matt");
  await shutPeek(up);
  // leave the fixture as we found it — later assertions count Matt's followers
  await up.goto(BASE + "/matt");
  await up.locator(".profacts .followpill", { hasText: "Following" }).click();
  await up.locator(".profacts .followpill", { hasText: /^Follow$/ }).waitFor();
  await upCtx.close();
}
console.log("subscribe ok (offer an account after, not before)");

// ---- 404 for unclaimed handle
const r = await page.goto(BASE + "/nobodyhere");
if (r.status() !== 404) fail("unclaimed handle should 404, got " + r.status());
await page.getByText("Nobody’s here yet.").waitFor();

// ---- desktop
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(BASE + "/app");
await page.waitForFunction(() => document.querySelectorAll(".ps-event").length >= 1);
await page.screenshot({ path: SCRATCH + "/shot-desktop-schedule.png" });
await page.goto(BASE + "/matt/schedule");
await page.waitForFunction(() => document.querySelector('.pub[data-theme="poster"] .ps-event'));
await page.screenshot({ path: SCRATCH + "/shot-desktop-public.png" });
await page.setViewportSize({ width: 390, height: 844 }); // back to the mobile flow
console.log("desktop ok");

// ---- my-page list count reflects subscriber
await openProfile(page);
await page.locator(".acctstats .acctstat", { hasText: "Followers" }).waitFor();
const subN = await page.locator(".acctstats .acctstat").nth(1).locator(".n").textContent();
if (subN.trim() !== "1") fail("follower count should be 1, got " + subN);
console.log("stats ok");

// ---- that follow dropped a notification. Messages and Notifications have
// independent doors and unread badges.
await page.goto(BASE + "/app");
await page.locator(".caladd").waitFor();
await expect(
  page.locator('.brandbar-actions [aria-label^="Notifications"] .inboxdot').isVisible(),
  "Updates bell shows the follow badge",
);
await page.locator('.brandbar-actions [aria-label^="Notifications"]').click();
await page.getByRole("heading", { name: "Notifications" }).waitFor();
// more than one person followed by now, so take the first rather than
// tripping strict mode
await expect(page.locator(".notifrow .nm", { hasText: "New follower" }).first().isVisible(), "follow notification listed");
{
  // Only the email subscriber so far, and they have no account, so this row
  // falls back to an icon. For months that icon was Icon's blank-circle
  // fallback, because person_add was never in the map.
  const icons = await page.locator(".notifrow-ic").count();
  if (!icons) fail("a follow from a plain email subscriber should fall back to an icon");
  const blank = await page
    .locator(".notifrow-ic svg")
    .evaluateAll((els) => els.filter((e) => e.querySelectorAll("*").length === 1).length);
  if (blank) fail(`${blank} notification icons are the blank-circle fallback`);
  console.log("notification icon ok (a real glyph, not the fallback circle)");
}
await page.goto(BASE + "/inbox");
await page.getByRole("heading", { name: "Messages" }).waitFor();
await page.getByText("No messages yet", { exact: false }).waitFor();
if (await page.locator(".updateseg").count()) fail("Messages and Notifications should not share a mode switch");
console.log("separate Notifications and Messages screens ok");

// ================= Phase 2: the weekly list =================
const CRON_KEY = process.env.CRON_SECRET ?? "smoke-cron";
let mailLog = readLog();
if (!mailLog.includes("[mail:welcome] to=fan@example.com")) fail("no welcome email in log");
if (!mailLog.includes("You're on Matt's list")) fail("welcome subject wrong");
const unsubUrl = (mailLog.match(/Unsubscribe any time: (\S+)/) || [])[1];
if (!unsubUrl) fail("no unsubscribe link in welcome email");
console.log("welcome email ok:", unsubUrl.slice(0, 40) + "…");

// publishing no longer sends a per-change email — subscribers get a weekly digest
await page.goto(BASE + "/app");
await addSaved(page);
await page.getByRole("button", { name: "Sa", exact: true }).click();
await page.locator(".publishwrap .btn").click();
await page.getByText("Published", { exact: false }).waitFor();
await closeLive(page);
await new Promise((r) => setTimeout(r, 300));
if (readLog().includes("[mail:schedule_change]")) fail("publish should not send a per-change email");
console.log("publish sends no per-change email ok");

// the weekly cron emails the subscriber the upcoming week with the class in it
let cron = await page.request.get(`${BASE}/api/cron/weekly?key=${CRON_KEY}`);
if (!cron.ok()) fail("weekly cron endpoint failed: " + cron.status());
await new Promise((r) => setTimeout(r, 500));
mailLog = readLog();
const weeklyBlock = mailLog.split("[mail:weekly_schedule] to=fan@example.com").slice(1).join("");
if (!weeklyBlock) fail("no weekly digest email to the subscriber");
if (!/Barbell Strength/.test(weeklyBlock)) fail("weekly digest missing the class");
console.log("weekly digest ok");

// unsubscribe link works and is honored. Emails use the canonical origin
// (fittlist.co); rewrite it to this local server so the sandbox can reach it.
const localUnsub = unsubUrl.replace(/^https?:\/\/[^/]+/, BASE);
await page.goto(localUnsub);
await page.getByText("You’re off the list.").waitFor();
console.log("unsubscribe page ok");

// opted-out subscriber is skipped on the next weekly run
const weeklyBefore = (readLog().match(/\[mail:weekly_schedule\] to=fan@example\.com/g) || []).length;
cron = await page.request.get(`${BASE}/api/cron/weekly?key=${CRON_KEY}`);
if (!cron.ok()) fail("weekly cron endpoint failed (2): " + cron.status());
await new Promise((r) => setTimeout(r, 500));
const weeklyAfter = (readLog().match(/\[mail:weekly_schedule\] to=fan@example\.com/g) || []).length;
if (weeklyAfter !== weeklyBefore) fail("opted-out subscriber still got the weekly email");
console.log("opt-out honored ok");

await openProfile(page);
await page.locator(".acctstats .acctstat", { hasText: "Followers" }).waitFor();
const subN2 = await page.locator(".acctstats .acctstat").nth(1).locator(".n").textContent();
if (subN2.trim() !== "0") fail("followers should be 0 after unsubscribe, got " + subN2);
console.log("opt-out honored ok");

// ================= Phase 3: dashboard + growth =================
await openProfile(page);
const vis0 = await page.locator(".acctstats .acctstat").nth(0).locator(".n").textContent();
if (vis0.trim() !== "0") fail("own profile views should not count, got " + vis0);
console.log("own-visit exclusion ok");

const anon = await browser.newContext({ viewport: { width: 390, height: 844 } });
const anonPage = await anon.newPage();
anonPage.setDefaultTimeout(10000);
await anonPage.goto(BASE + "/matt");
await anonPage.locator(".pubtab", { hasText: "Schedule" }).waitFor();
if ((await anonPage.locator(".ownerbar").count()) !== 0) fail("visitors must not see the owner bar");
await anonPage.goto(BASE + "/matt");
await anonPage.locator(".pubtab", { hasText: "Schedule" }).waitFor();

const ogRes = await anon.request.get(BASE + "/matt", { headers: { "user-agent": "Mozilla/5.0 (smoke test)" } });
const ogHtml = await ogRes.text();
if (!ogHtml.includes('property="og:title"') || !ogHtml.includes("Matt"))
  fail("og:title missing from profile page");
if (!ogHtml.includes('property="og:url"')) fail("og:url missing");
if (!ogHtml.includes("/?via=matt")) fail("footer link not attributed with ?via=matt");
// og:image has to be a URL an unfurler can fetch. The photo lives on the
// account as a data URL, and pointing the tag at the column shared a profile
// with no image at all: scrapers fetch over HTTP, they don't decode a data URI.
{
  const tag = ogHtml.match(/property="og:image"\s+content="([^"]+)"/);
  if (!tag) fail("og:image missing from profile page");
  if (tag[1].startsWith("data:")) fail("og:image is a data URL, which unfurls to nothing");
  if (!tag[1].includes("/api/og/matt")) fail("og:image should be the card route, got " + tag[1]);
  const card = await anon.request.get(BASE + "/api/og/matt");
  if (!card.ok()) fail("the link preview card is " + card.status());
  if (card.headers()["content-type"] !== "image/png")
    fail("the card should be a png, got " + card.headers()["content-type"]);
}
console.log("og tags + link preview card + attributed footer ok");

await anon.request.get(BASE + "/matt", { headers: { "user-agent": "facebookexternalhit/1.1" } });
await anon.request.get(BASE + "/matt", { headers: { "user-agent": "Twitterbot/1.0" } });

// Growth loop: sign up through the made-with footer, attributed to matt
await anonPage.locator(".madewith").getByText("Claim your page").click();
await anonPage.getByRole("button", { name: "Sign up with email" }).waitFor();
if (!anonPage.url().includes("via=matt")) fail("footer click lost via param: " + anonPage.url());
await anonPage.getByRole("button", { name: "Sign up with email" }).click();
await anonPage.getByRole("heading", { name: "Sign up with email" }).waitFor();
await anonPage.getByPlaceholder("you@example.com").fill("sam@example.com");
await anonPage.getByPlaceholder("Password").fill("smoke-pass-sam");
await anonPage.getByRole("button", { name: "Create account" }).click();
// anon context has no virtual authenticator; the biometric prompt still shows
await anonPage.getByRole("button", { name: "Not now" }).click();
await anonPage.getByText("Pick your link.").waitFor();
await anonPage.getByPlaceholder("Your name").fill("Sam");
await anonPage.getByRole("button", { name: "Claim it" }).click();
// claiming a handle runs the setup wizard; skip it to land on the schedule
await anonPage.getByRole("heading", { name: "Add a photo." }).waitFor();
await skipSetup(anonPage);
await anonPage.getByRole("heading", { name: "Your week is wide open" }).waitFor();
console.log("footer signup flow ok (attribution checked post-run)");

// Give Sam a class so there's a second coach for the coach-follows-coach test.
// An empty schedule offers the CTA, not the fab, so open the adder that way.
await anonPage.getByRole("button", { name: "Add your first class" }).click();
await anonPage.getByRole("heading", { name: "New class" }).waitFor();
await anonPage.getByRole("button", { name: "Select or start typing a studio" }).click();
await anonPage.getByRole("heading", { name: "Choose a studio" }).waitFor();
await anonPage.locator(".studio-row", { hasText: "Ironbound Strength" }).first().click();
await anonPage.locator(".studio-sel .nm", { hasText: "Ironbound Strength" }).waitFor();
await anonPage.locator("#fName").fill("Sam's Conditioning");
await anonPage.getByRole("button", { name: "Mo", exact: true }).click();
await anonPage.locator(".publishwrap .btn").click();
await anonPage.getByText("Your page is live").waitFor();
await closeLive(anonPage);
console.log("second coach has a class ok");

await openProfile(page);
// Profile views came off the You tab with the reorg: it was the only number
// up there with nowhere to go. The rollup still records (a studio's own page
// reads the same `page_visits` table through `coachAnalytics`), but a coach
// has no surface for their own count any more, so there is nothing to assert
// here. If the number gets a home again, this is where the check goes back.
{
  const first = (await page.locator(".acctstats .acctstat").nth(0).innerText()).trim();
  if (!first.includes("Following"))
    fail("the first stat should be Following now, got " + first);
}

// A visitor lands knowing whose app this is and how to get in. The footer line
// asks coaches to claim a page; this asks the person reading to join. Its own
// context, and after the view count above, because every load here is a visit.
{
  const look = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const lp = await look.newPage();
  lp.setDefaultTimeout(10000);
  await lp.goto(BASE + "/matt");
  const bar = lp.locator(".pubtop");
  await bar.waitFor();
  if (!(await bar.locator(".wordmark").isVisible()))
    fail("no wordmark on a visitor's view of a profile");
  const hrefs = await bar.locator("a").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  if (!hrefs.every((h) => h.includes("via=matt")))
    fail(`a header link drops the coach's credit: ${JSON.stringify(hrefs)}`);
  // One clear acquisition door up here. It opens the signup sheet directly;
  // returning members still have Sign in inside it.
  await bar.getByText("Sign up").click();
  await lp.waitForURL(/join=signup/);
  await lp.getByRole("heading", { name: "Sign up with email" }).waitFor();
  // And back the other way.
  await lp.locator(".authswitch").getByText("Sign in").click();
  await lp.getByRole("heading", { name: "Sign in" }).waitFor();
  await look.close();
  console.log("visitor header ok (one door, the sheet carries the other, credit kept)");
}
// The three stats are counts of people now, and every one opens its list.
for (const l of ["Following", "Followers", "Requests"])
  await expect(
    page.locator(".acctstats button.acctstat", { hasText: l }).isVisible(),
    `${l} stat opens a list`,
  );
console.log("stats ok (three counts of people, three doors)");

// ================= v1.5: story image =================
const story = await ctx.request.get(BASE + "/api/story/matt?span=week");
if (story.status() !== 200) fail("story endpoint returned " + story.status());
if (!(story.headers()["content-type"] || "").includes("image/png")) fail("story is not a png");
const buf = await story.body();
if (buf.readUInt32BE(16) !== 1080 || buf.readUInt32BE(20) !== 1920) fail("story should be 1080x1920");
const storyDay = await ctx.request.get(BASE + "/api/story/matt?span=day");
if (storyDay.status() !== 200) fail("story day span failed");
const s404 = await ctx.request.get(BASE + "/api/story/nobodyhere?span=week");
if (s404.status() !== 404) fail("story for unknown handle should 404, got " + s404.status());
console.log("story endpoint ok (1080x1920 png)");

// ---- iCal subscribe feed
const cal = await ctx.request.get(BASE + "/api/cal/matt");
if (cal.status() !== 200) fail("cal feed returned " + cal.status());
if (!(cal.headers()["content-type"] || "").includes("text/calendar")) fail("cal feed not text/calendar");
const ics = await cal.text();
if (!ics.includes("BEGIN:VCALENDAR") || !ics.includes("END:VCALENDAR")) fail("cal feed not a VCALENDAR");
if (!ics.includes("BEGIN:VEVENT")) fail("cal feed has no events");
if (!ics.includes("RRULE:FREQ=WEEKLY")) fail("cal feed missing weekly recurrence");
if (!ics.includes("SUMMARY:Barbell Strength")) fail("cal feed missing class name");
const cal404 = await ctx.request.get(BASE + "/api/cal/nobodyhere");
if (cal404.status() !== 404) fail("cal feed for unknown handle should 404, got " + cal404.status());
console.log("ical feed ok (VEVENT + weekly RRULE)");

// share sheet UI from the account page
await openProfile(page);
await page.getByRole("button", { name: "Share", exact: true }).click();
await page.locator(".sheet .setrow", { hasText: "Schedule story" }).click();
await page.locator(".sheet h2", { hasText: "Share your schedule" }).waitFor();
await page.waitForFunction(() => {
  const img = document.querySelector(".storyimg");
  return img && img.complete && img.naturalWidth > 0;
});
await page.locator(".seg").getByText("Today").click();
const imgSrc = await page.locator(".storyimg").getAttribute("src");
if (!imgSrc.includes("span=day")) fail("Today toggle didn't switch span: " + imgSrc);
// Share leads and is the filled button; Save is the quiet link under it and
// is a real download rather than a second door onto the share sheet.
// One button. Save had to open the same system sheet to reach Photos at all,
// so it was one act wearing two buttons, and that sheet already offers saving
// as one of its rows.
if (await page.locator(".publishwrap .btn", { hasText: "Save image" }).count())
  fail("Save image should be gone: the share sheet is where saving lives");
await expect(
  page.locator(".publishwrap .btn", { hasText: "Share image" }).first().isVisible(),
  "share image is the primary button",
);

// story style dropdown: 8 curated looks with swatches, selecting swaps the preview
await page.locator("#stTheme").click();
if ((await page.locator(".stylepick-row").count()) !== 8) fail("expected 8 story styles");
await page.locator(".stylepick-row", { hasText: "Moss" }).click();
const themedSrc = await page.locator(".storyimg").getAttribute("src");
if (!themedSrc.includes("theme=moss")) fail("colour chip didn't switch preview: " + themedSrc);
for (const th of ["paper", "moss", "pop", "midnight", "sunset", "blush", "slate"]) {
  const r2 = await ctx.request.get(BASE + `/api/story/matt?span=week&theme=${th}`);
  if (r2.status() !== 200 || !(r2.headers()["content-type"] || "").includes("image/png"))
    fail(`story colour ${th} endpoint broken`);
}
await page.locator("#stTheme").click();
await page.locator(".stylepick-row", { hasText: "Ink" }).click();
// custom headline: typing + blur persists and re-renders the preview
const preHeadlineSrc = await page.locator(".storyimg").getAttribute("src");
await page.locator(".storycustom input").fill("Lets work");
await page.locator(".storycustom input").blur();
await page.waitForFunction(
  (prev) => document.querySelector(".storyimg")?.getAttribute("src") !== prev,
  preHeadlineSrc,
);
await page.screenshot({ path: SCRATCH + "/shot-share-sheet.png" });
// close the story sheet, then the account page beneath it
await page.locator(".sheet .sheetclose").click();
await page.waitForFunction(() => !document.querySelector(".sheet"));
await closeProfile(page);
console.log("share sheet ok (save + share + colours + X close)");

// ================= dated classes: one-time option =================
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const nowD = new Date();
const dow0 = (nowD.getUTCDay() + 6) % 7; // 0 = Monday
const monD = new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth(), nowD.getUTCDate() - dow0));
// Tomorrow, not "Sunday of this week": that Sunday is sometimes today, and a
// one-off dated today at the saved 6am slot has already ended by the time an
// afternoon run asserts it, which is exactly when a schedule now drops it.
const inWeekD = new Date(nowD); inWeekD.setUTCDate(nowD.getUTCDate() + 1);
const nextWeekD = new Date(monD); nextWeekD.setUTCDate(monD.getUTCDate() + 9); // next week

await page.goto(BASE + "/app");
await page.waitForFunction(() => document.querySelectorAll(".ps-event[data-cid]").length > 0);
const schedBefore = await scheduleClasses(page);

// a one-off dated inside the current week
await addSaved(page);
await page.getByRole("button", { name: "One-time", exact: true }).click();
await page.locator('input[type="date"]').fill(iso(inWeekD));
const oneLabel = (await page.locator(".publishwrap .btn").textContent()).trim();
if (oneLabel !== "Publish event") fail("one-off publish label wrong: " + oneLabel);
await page.locator(".publishwrap .btn").click();
await page.getByText("Published", { exact: false }).waitFor();
await closeLive(page);
await waitSchedule(page, schedBefore + 1);
console.log("one-off in-week ok");

// a next-week one-off - the continuous calendar spans several weeks, so it shows too
await addSaved(page);
await page.getByRole("button", { name: "One-time", exact: true }).click();
await page.locator('input[type="date"]').fill(iso(nextWeekD));
await page.locator(".publishwrap .btn").click();
await page.getByText("Published", { exact: false }).waitFor();
await closeLive(page);
await waitSchedule(page, schedBefore + 2);
console.log("one-off future ok");

// the public schedule is a continuous multi-week window - it renders events
await page.goto(BASE + "/matt/schedule");
// The URL is the section: landing here renders the week, no scrolling involved.
await page.locator(".pubtab.sel", { hasText: "Schedule" }).waitFor();
if (await page.locator(".profabout").count())
  fail("the schedule URL should render the schedule, not the whole profile");
await page.waitForFunction(() => document.querySelectorAll(".ps-event").length > 0);
const pubCount = await eventCount(page);
if (pubCount < 1) fail(`public schedule should render events, got ${pubCount}`);
console.log("public continuous schedule ok (" + pubCount + " events)");

// ---- security: enroll a passkey via a CDP virtual authenticator (Face ID/
// fingerprint stand-in), then change the password, from the account page.
const cdp = await ctx.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: {
    protocol: "ctap2",
    transport: "internal",
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  },
});
await openProfile(page);
// Login & security lives under Account since the reorg, so it is two taps.
await page.locator(".settingslist .setrow", { hasText: "Account" }).first().click();
await page.locator(".sheet .setrow", { hasText: "Login & security" }).click();
await page.getByRole("heading", { name: "Login & security" }).waitFor();
// enroll a passkey (single passkey -> offers Remove afterwards)
await page.locator(".secrow", { hasText: "Face ID" }).getByRole("button", { name: "Add" }).click();
await page.getByText("Passkey added").waitFor();
await expect(
  page.locator(".secrow", { hasText: "Face ID" }).getByRole("button", { name: "Remove" }).isVisible(),
  "passkey row shows Remove after enrolling",
);
console.log("passkey enroll ok");

// change the password — requires the current password (re-auth)
await page.locator(".secrow", { hasText: "Password" }).getByRole("button", { name: "Change" }).click();
await page.getByRole("heading", { name: "Change password" }).waitFor();
await page.getByPlaceholder("Current password").fill("smoke-pass-123");
await page.getByPlaceholder("New password").fill("smoke-pass-456");
await page.getByRole("button", { name: "Save password" }).click();
await page.getByText("Password saved").waitFor();
console.log("password change ok");

// back out of the settings sheet, then log out from the account home
await page.locator(".sheet .sheetclose").click();
await page.getByRole("button", { name: "Log out" }).click();
await page.waitForURL(BASE + "/");
if ((await ctx.cookies()).some((c) => c.name === "fl_session" && c.value))
  fail("session cookie should be cleared after logout");
// a fresh load of /app now bounces to the signed-out landing
await page.goto(BASE + "/app");
await page.getByRole("button", { name: "Sign up with email" }).waitFor();
console.log("logout ok");

// ---- magic link: request one from the login sheet, follow the URL, land in /app
await page.goto(BASE + "/");
await page.getByRole("button", { name: "Already have an account? Sign in" }).click();
await page.getByRole("heading", { name: "Sign in" }).waitFor();
await page.getByPlaceholder("you@example.com").fill("matt@example.com");
await page.getByRole("button", { name: "Email me a magic link" }).click();
await page.getByText("Check your inbox.").waitFor();
await new Promise((r) => setTimeout(r, 400));
const magicUrl = [...readLog().matchAll(/\/auth\/magic\?token=[a-f0-9]{64}/g)].pop()[0];
// The magic route consumes the token (setting the session cookie) and then 302s
// to the canonical origin (fittlist.co), which is unreachable from the sandbox.
// Fire the request without following that cross-origin redirect — the Set-Cookie
// still lands in this context — then navigate to /app as an authenticated user.
const magicRes = await ctx.request.get(BASE + magicUrl, { maxRedirects: 0 });
if (![301, 302, 303, 307, 308].includes(magicRes.status()))
  fail("magic link should redirect after setting the session, got " + magicRes.status());
await page.goto(BASE + "/app");
await page.locator(".caladd").waitFor();
if (!(await ctx.cookies()).some((c) => c.name === "fl_session" && c.value))
  fail("magic link should establish a session");
console.log("magic-link login ok");

// log back out, then sign in with the enrolled passkey from the login sheet
await openProfile(page);
await page.getByRole("button", { name: "Log out" }).click();
await page.waitForURL(BASE + "/");
await page.getByRole("button", { name: "Already have an account? Sign in" }).click();
await page.getByRole("heading", { name: "Sign in" }).waitFor();
await page.getByRole("button", { name: "Use a passkey" }).click();
// Every login lands on the calendar. It was Following for months, and that
// went with the merged week: a coach lands on /app, a member on /week.
await page.waitForURL(BASE + "/app");
console.log("passkey login ok");

// ================= fan side (needs FANS_ENABLED=true on the server) =================
const fanCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const fan = await fanCtx.newPage();
fan.setDefaultTimeout(10000);
await fan.goto(BASE + "/");
await fan.getByRole("button", { name: "Sign up with email" }).click();
await fan.getByRole("heading", { name: "Sign up with email" }).waitFor();
await fan.locator(".roleseg button", { hasText: "here to train" }).click();
await fan.getByPlaceholder("you@example.com").fill("lindley@example.com");
await fan.getByPlaceholder("Password").fill("smoke-pass-fan");
await fan.getByRole("button", { name: "Create account" }).click();
// A member sets up the same way a coach does: passkey offer, then a name and
// a link, then their own two-step wizard. (They go through the invite gate
// too — this suite runs with INVITE_ONLY=false.)
await fan.getByRole("button", { name: "Not now" }).click().catch(() => {});
await fan.getByText("Pick your link.").waitFor();
await fan.getByPlaceholder("Your name").fill("Lindley");
await fan.getByRole("button", { name: "Claim it" }).click();
await fan.getByRole("heading", { name: "Add a photo." }).waitFor();
if ((await fan.locator(".wizdot").count()) !== 2)
  fail("a member's setup is two steps: photo, then who they are");
await skipSetup(fan);
await fan.waitForURL("**/week");
// A brand new member lands on their own empty calendar. It used to be the
// Following feed's "You're not following anyone", which was a screen whose
// emptiness was somebody else's fault; this one is theirs to fill, and it
// offers both ways to do it. No tray either: a rail with no faces reads as
// broken, so it is not drawn until there is a face for it.
await fan.locator(".empty-block", { hasText: "Your week is wide open" }).waitFor();
if (await fan.locator(".tray").count())
  fail("an account that follows nobody should have no tray");
// Both ways out: add something yourself, or go and follow somebody.
await fan.locator(".calempty-cta .btn.si").waitFor();
await fan.locator(".calempty-cta a[href='/discover']").waitFor();
// Home is parked. Nobody has the tab, and the concept is kept in
// homescreenspec.md rather than in a route nobody can reach.
if (await fan.locator('.navtab[data-tab="home"]').count())
  fail("the Home tab should be gone");

// phase 3: the directory. The empty calendar points at it; follow happens inline.
// It is one list now: Classes went first and Studios followed, both because a
// directory you cannot follow anything from is not doing this screen's one
// job. So there are no halves to pick and nothing to name.
await fan.locator(".calempty-cta a[href='/discover']").click();
await fan.locator(".dislist").waitFor();
if (await fan.locator(".distabs").count())
  fail("Discover is one list: there should be no halves to pick");
// The page title is gone: the tab bar already says Discover.
if (await fan.locator(".calbar-title", { hasText: "Discover" }).count())
  fail("the page still spends a headline on what the tab bar already says");
await fan.locator(".disrow", { hasText: "Matt" }).waitFor();
if (!(await fan.locator(".disrow", { hasText: "class" }).count()))
  fail("directory row missing the classes-this-week line");
// The box is a door to the universal search; the list itself is browsed.
// The Follow pill is back on a person's row, by Matt's call: following is
// most of what somebody is doing while they read this list, and sending them
// to a page to do it put a navigation between the want and the act. The
// chevron steps aside for it (two things in one corner is the row shouting)
// and the sub-line drops its "· Following", because the pill says both.
// Search keeps the quieter row, which is checked further down.
{
  const row = fan.locator(".disrow", { hasText: "Matt" }).first();
  await row.locator(".disfollow").waitFor();
  if (await row.locator(".disrow-chev").count())
    fail("the chevron and the pill should not share the corner");
  // Coaches only on this half, so the badge would never distinguish anything.
  if (await row.locator(".kindtag").count())
    fail("the Coach badge should be gone from the coaches half");
  if (/Following/.test(await row.locator(".sub").innerText()))
    fail("the sub-line shouldn't say Following while the pill does");
}
// The Coaches half lists coaches, and its chips are what they teach: one
// vocabulary with the studios', so the same word narrows either. Nobody in
// this fixture has said what they teach, so the rail is not drawn at all:
// a lone All is a filter that can only ever narrow nothing, and the rule is
// that a filter is offered where it can narrow something. If it is drawn,
// All leads it.
{
  const chips = (await fan.locator(".dischips .chip").allInnerTexts()).map((t) => t.trim());
  if (chips.length === 1) fail("a rail of nothing but All should not be drawn");
  if (chips.length && chips[0] !== "All")
    fail("the coaches rail should lead with All: " + chips.join("|"));
}
await fan.locator(".disrow", { hasText: "Matt" }).locator("a.disrow-main").click();
await fan.waitForURL("**/matt**");
await fan.locator(".profacts .followpill").waitFor();
await fan.waitForTimeout(400);
await fan.locator(".profacts .followpill").click();
await fan.locator(".profacts .followpill", { hasText: "Following" }).waitFor();
// and back on Discover, the row's own pill says so: it is the same follow
// however it was made, so the list has to agree with the page.
await discHalf(fan);
await fan
  .locator(".disrow", { hasText: "Matt" })
  .locator(".disfollow", { hasText: "Following" })
  .waitFor();
console.log("discover ok (the row's pill agrees with the profile)");

// Search is the coach directory now. Studios and classes have their own
// surfaces and should never leak back in through an old mixed-search result.
{
  await fan.goto(BASE + "/discover");
  await fan.locator(".dissearchrow").waitFor();
  await fan.locator(".dissearch-door").waitFor();
  if (await fan.locator(".dissearch-in").count())
    fail("Discover's box should be a door, not a filter");
  if (await fan.locator(".distabs").count())
    fail("Discover is one list now: there should be no halves to pick");
  await fan.locator(".dissearch-door").click();
  await fan.waitForURL(/\/search/);
  await fan.locator(".srchhead", { hasText: "Coaches" }).first().waitFor();
  if (await fan.locator(".srchseg, .disrow-studio, .callist").count())
    fail("Search should contain coaches only");
  console.log("search door opens the coaches-only directory");
}

// Filtering is the chip rail alone now: All leads it, filled in by default
// (the one selected chip is the hint the rest can be selected), and every
// chip after it is multiselect. One vocabulary: the same word a studio picks
// for what it offers.
{
  await page.goto(BASE + "/matt");
  await page.locator(".profacts .actpill", { hasText: "Edit profile" }).click();
  await page.getByRole("heading", { name: "Edit profile" }).waitFor();
  const yoga = page.locator(".typepick .chip", { hasText: "Yoga" }).first();
  await yoga.scrollIntoViewIfNeeded();
  await yoga.click();
  await page.locator(".sheet .publishwrap .btn").first().click();
  await page.getByText("Profile saved").waitFor();
  await page.waitForTimeout(700);
  // It shows on the page, so a coach can see what they said.
  await page.goto(BASE + "/matt/about");
  await page.locator(".studiotype", { hasText: "Yoga" }).waitFor();

  await discHalf(fan);
  // All leads the rail, already selected: no Filters sheet any more.
  await fan.locator(".dischips .chip.sel", { hasText: /^All$/ }).waitFor();
  if (await fan.locator(".chip-filters").count())
    fail("the Filters chip should be gone from the rail");
  // A pick takes All off and narrows to the coaches who teach that thing.
  await fan.locator(".dischips .chip", { hasText: /^Yoga$/ }).click();
  await fan.waitForTimeout(300);
  if (await fan.locator(".dischips .chip.sel", { hasText: /^All$/ }).count())
    fail("a pick should take All off");
  await fan.locator(".disrow", { hasText: "Matt" }).waitFor();
  // All is the way back off a pick.
  await fan.locator(".dischips .chip", { hasText: /^All$/ }).first().click();
  await fan.waitForTimeout(300);
  {
    const sel = (await fan.locator(".dischips .chip.sel").allInnerTexts()).map((t) => t.trim());
    if (sel.some((t) => t !== "All")) fail("All should clear a pick: " + sel.join("|"));
  }
  await fan.locator(".disrow", { hasText: "Sam" }).waitFor();
  console.log("discover filters ok (All leads filled in, picks are multiselect)");
}

// A filter is only offered where it can narrow something: what these coaches
// say they teach, and nothing borrowed from a list that is no longer here.
{
  await discHalf(fan);
  const chips = (await fan.locator(".dischips .chip").allInnerTexts()).map((c) => c.trim());
  if (chips[0] !== "All") fail("the rail should lead with All: " + chips.join("|"));
  if (chips.includes("Members"))
    fail("the kinds left the rail when members left the list");
  // One size, the filter pill's own: at the base chip size a filter read as
  // decoration on a screen whose whole job is finding somebody.
  const h = await fan
    .locator(".dischips .chip")
    .first()
    .evaluate((e) => e.getBoundingClientRect().height);
  if (Math.round(h) !== 38) fail("the rail's chips should be 38px tall, got " + h);
  console.log("discover chips ok (what they teach)");
}

// A profile carries no tab bar, so the arrow on the picture is the way off it
// and has to be on every one of them. From a list it pops back to that list;
// opened cold it goes to the app's front door, because there is nothing behind
// it and a control that does nothing is worse than one that does something
// plain.
{
  await discHalf(fan);
  await fan.locator(".disrow", { hasText: "Matt" }).locator(".disrow-main").click();
  await fan.locator(".pubhead").waitFor();
  if (await fan.locator(".navbar").count())
    fail("a profile should carry no tab bar: the arrow is the way off it");
  await fan.locator(".profback .evback").click();
  await fan.waitForURL(/\/discover/);
  // Popping back lands on the directory's own default half, which is Coaches.
  await fan.locator(".disrow", { hasText: "Sam" }).locator(".disrow-main").click();
  await fan.locator(".pubhead").first().waitFor();
  if (!(await fan.locator(".profback .evback").count()))
    fail("a profile reached from Discover should offer the way back");
  // Genuinely cold: a fresh tab, so the nav stack is empty and there is
  // nothing underneath to pop to. Reusing this one would not be cold, because
  // the stack survives a goto.
  {
    const coldCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const cold = await coldCtx.newPage();
    cold.setDefaultTimeout(10000);
    await cold.goto(BASE + "/matt");
    await cold.locator(".pubhead").waitFor();
    if (!(await cold.locator(".profback .evback").count()))
      fail("a cold open still needs a way off the page");
    await cold.locator(".profback .evback").click();
    await cold.waitForURL((u) => u.pathname === "/");
    await coldCtx.close();
  }
  console.log("discover back ok (a list you came from is a list you can return to)");
}

// ---- Coach search: one box, one kind of result. Studios and classes have
// their own surfaces now, so neither a query nor an old Recent entry may put
// one back on this screen.
{
  await fan.goto(BASE + "/discover");
  // Seed the shape an older build wrote. Search hides studio recents without
  // destructively rewriting storage, so a rollback can still read them while
  // this screen remains coaches-only.
  await fan.evaluate(() =>
    localStorage.setItem(
      "fl-recent-searches",
      JSON.stringify([
        { t: "s", name: "Ironbound Strength", base: "s/ironbound-strength" },
      ]),
    ),
  );
  await fan.locator(".dissearch-door").click();
  await fan.waitForURL(/\/search/);
  await fan.locator(".srchhead", { hasText: /^Coaches/ }).waitFor();
  if (await fan.locator(".recentrow").count())
    fail("an old studio recent should be hidden from coach search");
  if (await fan.locator(".srchseg, .disrow-studio, .callist, .clline").count())
    fail("coach search should have no studio/class controls or rows");

  const input = fan.locator(".header-search-input").first();
  if ((await input.getAttribute("placeholder")) !== "Search coaches")
    fail("the search box should promise coaches only");
  // The box takes the caret on arrival, so the keyboard is already up.
  if (!(await fan.evaluate(() => document.activeElement?.classList.contains("header-search-input"))))
    fail("the search box should be focused on arrival");

  // One letter is not a question: the floor keeps a stray keystroke from
  // searching. The uncounted browse heading stays in place until the second.
  await input.fill("m");
  await fan.waitForTimeout(600);
  if (await fan.locator(".srchhead span").count())
    fail("one character should not replace browse with search results");

  // A studio-only name finds nothing here. This is the behavioral boundary,
  // not merely a hidden Studios heading over results the client still fetched.
  await input.fill("Ironbound Strength");
  await fan.locator(".empty-block", { hasText: "No coaches match that" }).waitFor();
  if (await fan.locator(".disrow-studio, .callist, .clline").count())
    fail("a studio-only query leaked a studio or class into coach search");

  // A coach by name, with the directory's own row: the week count and the
  // corner chevron, without a redundant Coach badge in a coaches-only list.
  await input.fill("matt");
  await fan.locator(".disrow", { hasText: "Matt" }).first().waitFor();
  {
    const heads = (await fan.locator(".srchhead").allInnerTexts()).map((t) =>
      t.split("\n")[0].trim(),
    );
    if (heads.length !== 1 || heads[0] !== "Coaches")
      fail("coach search should have one Coaches section: " + heads.join("|"));
    const row = fan.locator(".disrow", { hasText: "Matt" }).first();
    if (await row.locator(".kindtag").count())
      fail("a coaches-only list should not repeat Coach on every row");
    await row.locator(".disrow-txt .wk").waitFor();
    await row.locator(".disrow-chev").waitFor();
  }

  // Coach metadata remains useful: a location can find coaches there, but it
  // no longer brings the studios in that town along for the ride.
  await input.fill("jersey city");
  await fan.locator(".disrow", { hasText: "Matt" }).first().waitFor();
  if (await fan.locator(".disrow-studio, .callist, .clline").count())
    fail("a location search should still return coaches only");

  // One box only: the place field came off for now, so the town rides the
  // same box a name does.
  if (await fan.locator(".srchlocrow").count())
    fail("the location field should be gone from search");

  // Nothing matches says so, once, and offers no rows.
  await input.fill("zzqqxx");
  await fan.locator(".empty-block", { hasText: "No coaches match that" }).waitFor();
  if (await fan.locator(".srchhead").count()) fail("an empty result should carry no headings");

  // Tapping through and back: the arrow names the list you came from.
  await input.fill("matt");
  await fan.locator(".disrow", { hasText: "Matt" }).first().waitFor();
  await fan.locator(".disrow", { hasText: "Matt" }).first().locator(".disrow-main").click();
  await fan.locator(".pubhead").waitFor();
  if (!/from=search/.test(fan.url())) fail("a search result should say where it came from: " + fan.url());
  await fan.locator(".profback .evback").click();
  await fan.waitForURL(/\/search/);

  // Recent holds what was tapped, not what was typed: one visit to Matt's
  // page means one coach row, wearing his name and linking straight there.
  {
    await fan.locator(".srchsec", { hasText: "Recent" }).waitFor();
    const rec = fan.locator("a.recentrow");
    if ((await rec.count()) !== 1)
      fail("one tapped result should mean exactly one recent: " + (await rec.count()));
    if (!/Matt/.test(await rec.first().innerText()))
      fail("recent should carry the tapped row's name, not the typed text");
    await rec.first().click();
    await fan.waitForURL(/\/matt\?from=search/);
    await fan.locator(".profback .evback").click();
    await fan.waitForURL(/\/search/);
    // Clear means it: Recent leaves and the coaches browse list remains.
    await fan.locator(".srchclear").click();
    await fan.locator(".recentrow").waitFor({ state: "detached" });
    await fan.locator(".srchhead", { hasText: /^Coaches/ }).waitFor();
  }
  console.log("coach search ok (one result kind, studio recents hidden, coach recents kept)");
}

// The studio directory is coach-editable, and a coach is kind, not handle:
// members hold handles too, and testing the handle put the edit button on
// every member's screen and left the action open behind it.
await fan.goto(BASE + "/s/ironbound-strength");
await fan.locator(".profname", { hasText: "Ironbound Strength" }).waitFor();
// The three dots hold everything you can do with a studio; the edit row is
// the one thing a member's menu must not carry.
await fan.locator(".ownermore").click();
await fan.locator(".ownermenu").waitFor();
if (await fan.locator(".ownermenu .setrow", { hasText: "Edit studio" }).count())
  fail("a member should not see the studio edit row");
await fan.locator(".ownermenu .setrow", { hasText: "Report this studio" }).waitFor();
await fan.locator(".sheetclose").click();
await fan.locator(".ownermenu").waitFor({ state: "detached" });
console.log("studio edits are coach-only ok (no edit row in a member's menu)");
await fan.goto(BASE + "/week");
// What a follow buys: a face at the top of the calendar, and that coach's
// fortnight behind it. The merged week this replaced put their classes
// straight onto the schedule, which meant saving one changed nothing you
// could see; now the save is the thing that moves a class onto your week.
await fan.locator(".tray").waitFor();
await fan.locator(".trayitem", { hasText: "Matt" }).waitFor();
// The rail ends in the way to lengthen it: a door to Discover, never one of
// the faces.
{
  const add = fan.locator(".trayitem", { hasText: "Add" });
  await add.waitFor();
  if ((await add.getAttribute("href")) !== "/discover")
    fail("the rail's plus should open Discover: " + (await add.getAttribute("href")));
}
// A coach nobody has peeked at yet is lit: the ring is what makes the tray a
// tool rather than six circles.
if (!(await fan.locator(".trayav.fresh").count()))
  fail("a coach never peeked at should wear the ring");
await openPeek(fan, "Matt");
{
  const rows = await fan.locator(".peekrow").count();
  if (rows < 1) fail("the peek has no class rows");
  // Every row offers the save, and none of them claims the viewer coaches it:
  // this is somebody else's week by construction.
  if ((await fan.locator(".peekadd").count()) !== rows)
    fail("every row in the peek should offer the save");
  if (await fan.locator(".peeksheet .ps-youtag, .peeksheet .evcard-mine").count())
    fail("a member coaches nothing, least of all in somebody else's peek");
  // The sub-line reads time, length and where, with no pin competing.
  const sub = fan.locator(".peekrow-sub").first();
  const txt = (await sub.innerText()).trim();
  if (await sub.locator(".icon svg").count()) fail("the peek row should have no place pin");
  if (txt.split("\u00b7").length < 2) fail("the sub-line should read time then length: " + txt);
  if (!/\d+ min/.test(txt)) fail("the sub-line should carry the length: " + txt);
}
// The peek names whose week it is, once, and offers the way to their page.
{
  const nm = (await fan.locator(".peekhead-nm").innerText()).trim();
  if (!/Matt/.test(nm)) fail("the peek should name the coach: " + nm);
  if ((await fan.locator(".peekhead-nm").count()) !== 1)
    fail("the peek should say the name once, not in a title bar as well");
}
await shutPeek(fan);
// ...and opening it puts the ring out, because they have looked.
await fan.reload();
await fan.locator(".tray").waitFor();
if (await fan.locator(".trayav.fresh").count())
  fail("the ring should clear once the peek has been opened");
console.log("fan flow ok (signup -> follow -> a face, and their week behind it)");

// The profile's schedule wears the same flat rows every schedule does now.
// The ribbon is the row's one action, and only for somebody the class could
// belong to; the share circle came off every row, because sharing lives on
// the class sheet. The owner's rows carry nothing in the corner.
{
  await fan.goto(BASE + "/matt");
  await fan.locator(".pub .callist .ps-erow").first().waitFor();
  const row = fan.locator(".pub .callist .ps-erow").first();
  await row.locator(".evcard-add").waitFor();
  if (await row.locator(".evcard-share").count())
    fail("the share circle should be gone from class rows");
  await page.goto(BASE + "/matt");
  await page.locator(".pub .callist .ps-erow").first().waitFor();
  if (await page.locator(".evcard-share").count())
    fail("the owner's rows should carry no share circle either");
  if (await page.locator(".evcard-add").count())
    fail("the owner has nothing to add: it is already their class");
  console.log("profile rows ok (the ribbon for a member, nothing else)");
}

// Now someone with an account has followed, so the coach sees a face rather
// than a badge: "New follower" is more use when you can tell who.
{
  await page.goto(BASE + "/updates");
  await page.locator(".notifrow").first().waitFor();
  await page.waitForTimeout(400);
  const faces = await page.locator(".notifrow-av").count();
  if (!faces) fail("a follow from an account should show that person's avatar");
  console.log(`follower faces on the updates feed ok (${faces})`);
}

// photo-less coaches must be visually distinct — that's the whole point of the
// palette, so no two listed coaches may share a colour
await discHalf(fan);
await fan.locator(".disrow-av-empty").first().waitFor();
const avColors = await fan.locator(".disrow-av-empty").evaluateAll((els) =>
  els.map((e) => getComputedStyle(e).backgroundColor),
);
if (new Set(avColors).size !== avColors.length)
  fail("photo-less coaches share an avatar colour: " + avColors.join(", "));
if (avColors.some((c) => !c || c === "rgba(0, 0, 0, 0)")) fail("avatar rendered with no colour");
console.log(
  `avatar colours ok (${avColors.length} listed, all distinct)` +
    (avColors.length < 2 ? " — only one coach is listed, so this is a weak check" : ""),
);

// Saving a class + the member's share image, the mirror of the coach's story.
// The class is reached through the coach's circle now, which is the only door
// there is: nothing they publish is on this calendar until it is saved.
await fan.goto(BASE + "/week");
await openPeek(fan, "Matt");
// The class opens from the bottom, over the peek, so the list is still behind
// it and the save reads as picking something up rather than going somewhere.
await fan.locator(".peekrow-go").first().click();
await fan.locator(".classoverlay-nm").waitFor();
await fan.locator(".ovcta-save").click();
// The note answers the tap and hands over to the week, pointed at the one
// occurrence it means. The visibility choice came off it by Matt's call, so
// the only link is the way there.
await fan.locator(".favtoast.on .favtoast-link", { hasText: "See them" }).waitFor();
if (await fan.locator(".favtoast.on .favtoast-link", { hasText: "Make it private" }).count())
  fail("the note should no longer offer the private option");
await fan.locator(".ovcta-save.on").waitFor();
// Share is here too, so a class can be passed on without leaving it.
await fan.locator(".ovcircle-share").waitFor();
await fan.locator(".ovcircle-back").click();
await fan.waitForFunction(() => !document.querySelector(".classoverlay"));

// ...and the save is on the server, not in the tab: the peek says so on a
// fresh load, and the calendar underneath now carries the class.
await fan.goto(BASE + "/week");
await openPeek(fan, "Matt");
await fan.locator(".peekadd.on").first().waitFor();
await shutPeek(fan);
await fan.locator(".callist .ps-event").first().waitFor();
{
  const saved = await fan.locator(".callist .ps-event.ev-added").count();
  if (!saved) fail("the saved class should be on the member's calendar");
}
// Flat rows are gone: a card again, per the design, because the flat row could
// not draw a boundary on a list that mixes a class you teach, a shift, one you
// saved and a dentist. The saved bar is ink, the one relationship that is not
// a hue of its own.
{
  const card = await fan.evaluate(() => {
    const ev = document.querySelector(".callist .ps-event.ev-added");
    const bar = ev.querySelector(".ps-accent");
    return {
      shadow: getComputedStyle(ev).boxShadow,
      radius: getComputedStyle(ev).borderTopLeftRadius,
      barW: bar ? bar.getBoundingClientRect().width : 0,
      barBg: bar ? getComputedStyle(bar).backgroundColor : null,
      av: ev.querySelectorAll(".ps-eav").length,
      shares: document.querySelectorAll(".evcard-share").length,
    };
  });
  if (card.shadow === "none") fail("a class row is a card again, and a card has a shadow");
  if (card.radius === "0px") fail("the card should carry its radius, got " + card.radius);
  if (!card.av) fail("the card leads with a face");
  if (card.barW < 3) fail("the accent bar should be visible, got " + card.barW);
  if (card.barBg !== "rgb(25, 21, 2)")
    fail("a saved row's bar is ink, got " + card.barBg);
  if (card.shares > 0) fail("the share circle should be gone from class rows");
}
if (await fan.locator(".goingtoggle").count()) fail("the Show going filter should be gone");

// ---- The member's Schedule tab: their calendar, whole screen. The tools
// rail left it for the You tab, and the five tabs are the same for everyone.
{
  await fan.goto(BASE + "/discover");
  if (await fan.locator('.navtab[data-tab="plans"]').count())
    fail("Plans should have left the tab bar");
  // Two: Following went with the merged week it pointed at.
  if ((await fan.locator(".navtab").count()) !== 2) fail("expected 2 tabs");
  if (await fan.locator(".navtab", { hasText: "Following" }).count())
    fail("Following should have left the tab bar with its screen");
  if (await fan.locator(".plansbtn").count())
    fail("the plans ribbon should have left the header");
  await fan.locator(".navtab", { hasText: "Schedule" }).click();
  await fan.waitForURL(/\/week/);
  await fan.locator(".caladd").waitFor();
  if (!(await fan.locator(".navtab.on", { hasText: "Schedule" }).count()))
    fail("the Schedule tab should light on the member calendar");
  // It's in the tabs group, so the shell above it never unmounts.
  if (!(await fan.locator(".navbar").count()))
    fail("your week should keep the bottom tabs");
  // The calendar is the whole screen: the rail lives on You now.
  if (await fan.locator(".schedtools").count())
    fail("the tools rail should have left the calendar for the You tab");
  // The big plus, same as every calendar.
  await fan.locator(".caladd").waitFor();
  // The rows are the shared class rows now, the same ones Following draws.
  const rows = fan.locator(".ps-erow");
  if ((await rows.count()) !== 1) fail("expected one class in the week, got " + (await rows.count()));
  // The row carries what you'd need to decide: what, when, where, whose.
  const txt = await rows.first().innerText();
  for (const bit of ["Barbell Strength", "min", "Matt"])
    if (!txt.includes(bit)) fail(`the week row is missing "${bit}": ${txt}`);
  // Every row can leave, and it asks first: this is a list of things you meant
  // to do, and the x is one tap away from all of them.
  await rows.first().locator(".weekrow-x").click();
  await fan.locator(".confirmsheet").waitFor();
  await fan.getByRole("button", { name: "Keep it" }).click();
  await fan.waitForFunction(() => !document.querySelector(".confirmsheet"));
  if ((await rows.count()) !== 1) fail("Keep it should leave the class where it was");
  await rows.first().locator(".weekrow-x").click();
  await fan.getByRole("button", { name: "Remove it" }).click();
  await fan.getByText("Removed from your plans").waitFor();
  await fan.locator(".empty-block", { hasText: "Your week is wide open" }).waitFor();
  // Put it back for the checks below, through the one door there is.
  await openPeek(fan, "Matt");
  await fan.locator(".peekrow-go").first().click();
  // Before the tap: an empty calendar and the word.
  {
    const off = (await fan.locator(".ovcta-save").innerText()).trim();
    if (off !== "Add") fail(`the control should read Add before the tap, got "${off}"`);
  }
  await fan.locator(".ovcta-save").click();
  await fan.getByText("Added. Followers can see it.").waitFor();
  // The ribbon fills in solid and the word leaves with the tap. It was a
  // heart, which said "favourite" and meant "I'm going".
  await fan.locator(".ovcta-save.on").waitFor();
  if ((await fan.locator(".ovcta-save").innerText()).trim())
    fail("the added calendar should drop the word");
  {
    const paint = await fan
      .locator(".ovcta-save.on .icon svg path")
      .last()
      .evaluate((e) => ({ fill: getComputedStyle(e).fill, rule: getComputedStyle(e).fillRule }));
    if (paint.fill !== "rgb(250, 248, 242)")
      fail("the added ribbon should fill paper-white on the dark pill, got " + paint.fill);
    // The filled ribbon is solid now: the tick came off, so there is no
    // evenodd hole left to cut. Solid against the outline at rest is the
    // whole signal.
    if (paint.rule === "evenodd") fail("the added ribbon should be solid, with no tick hole");
  }
  // Whose class it is, as a face and a name.
  await fan.locator(".classoverlay-coach .classsheet-av").waitFor();
  if ((await fan.locator(".classoverlay-coach").innerText()).toLowerCase().startsWith("with"))
    fail("the coach line should say coached by, then the name");
  await fan.locator(".ovcircle-back").click();
  await fan.goto(BASE + "/week");
}
console.log("your week ok (count ahead, rows leave, points at a real calendar)");

// ---- A class you go to is filled in with the coach's own form, lands in your
// plans and nowhere else, and leaves its details at the studio for the next
// person. The delineation is the one question a coach gets asked.
{
  await fan.goto(BASE + "/week");
  // The plus asks which kind: a class, or anything else. Never which hat;
  // a member has no coaching row to offer.
  await fan.locator(".caladd").click();
  await fan.getByRole("heading", { name: "Add to your calendar" }).waitFor();
  if (await fan.locator(".sheet .setrow", { hasText: "coaching" }).count())
    fail("a member should not be offered a coaching row");
  if (!(await fan.locator(".sheet .setrow", { hasText: "Anything else" }).count()))
    fail("the add sheet should offer anything else");
  await fan.locator(".sheet .setrow", { hasText: "going to" }).click();
  await fan.getByRole("heading", { name: "Add a class" }).waitFor();
  if (await fan.locator(".modetoggle", { hasText: "coaching" }).count())
    fail("a member should not be asked whether they coach it");
  if (await fan.locator(".modetoggle", { hasText: "Public" }).count())
    fail("a class you go to has no public/private choice");
  // The full form, not five fields: a studio, a description, a photo.
  await fan.locator("#fDesc").waitFor();
  await fan.locator(".classpho").waitFor();

  await fan.getByRole("button", { name: "Select or start typing a studio" }).click();
  await fan.getByRole("heading", { name: "Choose a studio" }).waitFor();
  await fan.getByRole("button", { name: "+ New studio" }).click();
  await fan.getByPlaceholder("e.g. Palisade Barbell").fill("Bright Room Yoga");
  await fan
    .getByPlaceholder("e.g. 501 Palisade Ave, Jersey City")
    .fill("88 Newark Ave, Jersey City");
  await fan.getByRole("button", { name: "Add studio" }).click();
  await fan.getByText("Added to the studio directory").waitFor();
  await fan.getByPlaceholder("e.g. Barbell Strength").fill("Wellness Off the Mat");
  await fan.locator("#fDesc").fill("Slow flow and a long savasana.");
  await fan.locator("#fWith").fill("Erin Clyne");
  await fan.getByRole("button", { name: "We", exact: true }).click();
  // Late, and this matters. Every public surface drops an occurrence once it
  // has ended, so a fixture at midday on a fixed weekday is visible for half
  // of that day and gone for the rest, with the next one seven days out and
  // past the week a studio page draws. This suite then failed by the clock:
  // green in the morning, red after lunch, on unchanged code. Ending a minute
  // before midnight keeps it ahead on its own day whenever the suite runs.
  await fan.locator("#fStart").fill("23:00");
  await fan.locator("#fEnd").fill("23:59");
  await fan.locator(".publishwrap .btn").click({ force: true });
  await fan.getByText("Added to your plans").waitFor();
  await fan.waitForTimeout(800);
  {
    // A weekly entry recurs across the horizon now, so take the first.
    const row = fan.locator(".ps-erow", { hasText: "Wellness Off the Mat" }).first();
    await row.waitFor();
    const txt = await row.innerText();
    // The studio owns the "where", exactly as on a coach's class.
    for (const bit of ["Bright Room Yoga", "Erin Clyne"])
      if (!txt.includes(bit)) fail(`the plan row is missing "${bit}": ${txt}`);
  }
  // The details stayed at the studio: opening the form there again offers it.
  await fan.locator(".caladd").click();
  await fan.getByRole("heading", { name: "Add to your calendar" }).waitFor();
  await fan.locator(".sheet .setrow", { hasText: "going to" }).click();
  await fan.getByRole("heading", { name: "Add a class" }).waitFor();
  await fan.getByRole("button", { name: "Select or start typing a studio" }).click();
  // Scoped to the picker: a class row is a button too now, and the one behind
  // the sheet carries the studio's name on it.
  await fan.locator(".studio-list .studio-row", { hasText: "Bright Room Yoga" }).first().click();
  await fan.locator(".flabel", { hasText: "pick one from this studio" }).waitFor();
  await fan.locator(".sheetclose").first().click();
  await fan.waitForTimeout(400);
  console.log("your own class ok (the whole form, into your plans and the studio's list)");

  // Anything else: the same form with the class-shaped parts put away. No
  // studio, no type, no photo; a where, notes, and a when.
  await fan.locator(".caladd").click();
  await fan.getByRole("heading", { name: "Add to your calendar" }).waitFor();
  await fan.locator(".sheet .setrow", { hasText: "Anything else" }).click();
  await fan.getByRole("heading", { name: "New event" }).waitFor();
  if (await fan.getByRole("button", { name: "Select or start typing a studio" }).count())
    fail("an event should not ask for a studio");
  if (await fan.locator("#fType").count()) fail("an event has no class type");
  if (await fan.locator(".classpho").count()) fail("an event has no photo");
  await fan.getByPlaceholder("e.g. PT session, physio, flight home").fill("Physio");
  await fan.locator("#fLoc").fill("Downtown clinic");
  await fan.getByRole("button", { name: "Th", exact: true }).click();
  await fan.locator("#fStart").fill("09:00");
  await fan.locator(".publishwrap .btn").click({ force: true });
  await fan.getByText("Added to your calendar").waitFor();
  await fan.waitForTimeout(800);
  // A fresh load rather than racing router.refresh under suite load; the
  // class path above already proves the in-place refresh.
  await fan.goto(BASE + "/week");
  await fan.locator(".ps-erow", { hasText: "Physio" }).first().waitFor();
  // ...and it wears the Personal colour; unchecking Going leaves it standing.
  {
    const row = fan.locator(".ps-erow", { hasText: "Physio" }).first();
    const txt = await row.innerText();
    if (!txt.includes("Downtown clinic")) fail(`the event row is missing its where: ${txt}`);
    if (/Going/.test(txt)) fail("a personal event wears no badge");
    if (!(await row.locator(".ps-event.ev-private").count()))
      fail("a personal event should wear the Personal colour");
  }
  // The kind filters live behind the header's filter glyph now, as a sheet
  // of switches. Turning Added off narrows to the event; back on restores.
  await fan.locator(".calfilter").click();
  await fan.getByRole("heading", { name: "Show on your calendar" }).waitFor();
  await fan.locator('.setrow[data-kind="added"]').click();
  await fan.locator(".sheetclose").click();
  await fan.locator(".ps-erow", { hasText: "Physio" }).first().waitFor();
  if (await fan.locator(".ps-event.ev-added").count())
    fail("switching Added off should drop the added rows");
  await fan.locator(".calfilter").click();
  await fan.locator('.setrow[data-kind="added"]').click();
  await fan.locator(".sheetclose").click();
  await fan.locator(".ps-event.ev-added").first().waitFor();
  console.log("an event ok (no class furniture, wears the Personal colour)");

  // Your own entries are on your week, and who sees that week is the
  // Instagram rule: open unless you have approve-first on. This account does
  // not, so a stranger with the link sees it too, which is the point of a
  // scheduling app. The approve-first half is checked further down.
  {
    const mine = await (await fan.request.get(`${BASE}/lindley`)).text();
    if (!/Wellness Off the Mat/.test(mine))
      fail("your own entries should be on the week you show people you follow back");
    const strangerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const seen = await (await strangerCtx.request.get(`${BASE}/lindley`)).text();
    await strangerCtx.close();
    if (!/Wellness Off the Mat/.test(seen))
      fail("an open account's week should be visible to anyone with the link");
  }

  // The poster covers the range you ask for, and it starts where your plans
  // do: a class nine days out used to share as a blank image with no way to
  // tell why. The door is the You tab's share row now.
  if (await fan.locator(".weekshare").count())
    fail("the floating share pill should have made way for the You tab's row");
  await fan.goto(BASE + "/you");
  await fan.getByRole("button", { name: "Share", exact: true }).click();
  await fan.locator(".sheet .setrow", { hasText: "Schedule story" }).click();
  await fan.getByRole("heading", { name: "Share your plans" }).waitFor();
  {
    const from = await fan.locator("#myFrom").inputValue();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) fail("the share range needs a real start date: " + from);
    const src = await fan.locator(".storyimg").getAttribute("src");
    if (!src?.includes(`from=${from}`) || !src.includes("days=7"))
      fail("the image should be asked for over the chosen range: " + src);
    // One day is the floor and it is a real option.
    await fan.locator("#mySpan").selectOption("1");
    await fan.waitForTimeout(300);
    const one = await fan.locator(".storyimg").getAttribute("src");
    if (!one?.includes("days=1")) fail("a one-day range should reach the image: " + one);
    // And the image itself renders, with their own entry on it.
    const png = await fan.request.get(`${BASE}/api/story/me?from=${from}&days=7`);
    if (!png.ok()) fail("the story image should render for a range");
    const buf = Buffer.from(await png.body());
    if (buf.readUInt32BE(16) !== 1080 || buf.readUInt32BE(20) !== 1920)
      fail("the story image should still be 1080x1920");
    await fan.locator(".sheetclose").first().click();
  }
  console.log("share range ok (starts where the plans do, one day to seven)");

  // The entry they just added put Bright Room Yoga on the map: an unclaimed
  // studio's page draws its week from what people added, as a plain row
  // (there is no page behind it), and nothing anywhere says who.
  await fan.goto(BASE + "/s/bright-room-yoga");
  await fan.locator(".pubtab.sel", { hasText: "Schedule" }).waitFor();
  // The note is an info dot beside the tab now, and its sheet carries the
  // claim ask.
  await fan.locator(".pubtab-info").click();
  await fan.getByText("Built by coaches and members who train here").waitFor();
  await fan.getByRole("button", { name: "Get in touch" }).waitFor();
  await fan.locator(".sheetclose").first().click();
  await fan.waitForFunction(() => !document.querySelector(".sheet"));
  if (await fan.locator(".commnote").count())
    fail("the paragraph should have become the info dot's sheet");
  await fan.locator(".ps-event-plain", { hasText: "Wellness Off the Mat" }).waitFor();
  {
    const body = (await fan.locator("body").innerText()).toLowerCase();
    if (body.includes("lindley")) fail("a community schedule must never say who added a class");
  }
  console.log("community schedule ok (built from what people added, never attributed)");
  // Back where the next block expects to find them.
  await fan.goto(BASE + "/week");
  await fan.locator(".callist .ps-event").first().waitFor();
}

// A coach adding to their calendar is asked which hat first, by the plus
// itself: both are true for them, and the sheet pre-answers the form's own
// question. An old /week link sends them to their calendar.
{
  await page.goto(BASE + "/week");
  await page.waitForURL(/\/app/);
  await page.locator(".caladd").click();
  await page.getByRole("heading", { name: "Add to your calendar" }).waitFor();
  {
    const rows = (await page.locator(".sheet .setrow .t").allInnerTexts()).map((t) => t.trim());
    if (
      rows.length !== 3 ||
      !/coaching/.test(rows[0]) ||
      !/going to/.test(rows[1]) ||
      !/Anything else/.test(rows[2])
    )
      fail("the plus should offer coaching, going and anything else: " + rows.join("|"));
  }
  await page.locator(".sheet .setrow", { hasText: "going to" }).click();
  await page.getByRole("heading", { name: "Add a class" }).waitFor();
  // Pre-answered: the form doesn't ask again, and there is nothing public
  // about a class you only go to.
  if (await page.locator(".adder-card", { hasText: "Is this yours to teach?" }).count())
    fail("the plus already asked; the form should not ask again");
  if (await page.locator(".modetoggle", { hasText: "Public" }).count())
    fail("going to a class has no public/private choice");
  await page.locator(".sheetclose, .adderclose").first().click();
  await page.waitForTimeout(300);
  console.log("coaching or going ok (the plus asks, and the form follows the answer)");

  // One of a coach's own entries can be taken off again. It could not for a
  // long time: the editor's delete bails on a class id and a personal row has
  // an editId instead, and the member's X on /week was the only remove wired
  // anywhere. The door is PlanSheet, which both calendars already open.
  await page.locator(".caladd").click();
  await page.locator(".sheet .setrow", { hasText: "Anything else" }).click();
  await page.getByRole("heading", { name: "New event" }).waitFor();
  await page.getByPlaceholder("e.g. PT session, physio, flight home").fill("Dentist");
  await page.locator("#fLoc").fill("Elm Street");
  await page.getByRole("button", { name: "Sa", exact: true }).click();
  // Not late enough to wrap: the end time follows the start by an hour, and
  // past midnight the duration goes negative and the button quietly disables.
  await page.locator("#fStart").fill("18:30");
  // No force: a disabled publish button swallows a forced click without a
  // word, and the failure lands ten seconds later on a toast that never comes.
  await page.locator(".publishwrap .btn").click();
  await page.getByText("Added to your calendar").waitFor();
  await page.waitForTimeout(800);
  await page.goto(BASE + "/app");
  await page.locator('.ps-event[data-plan="yours"]', { hasText: "Dentist" }).first().click();
  await page.locator(".classoverlay-nm", { hasText: "Dentist" }).waitFor();
  await page.locator(".classoverlay .deletelink").click();
  await page.getByRole("heading", { name: "Remove Dentist?" }).waitFor();
  // The way out of the question, first: it has to mean it.
  await page.locator(".confirm-keep").click();
  await page.waitForTimeout(300);
  await page.locator(".classoverlay .deletelink").click();
  await page.locator(".confirmsheet .btn.si").click();
  await page.getByText("Removed from your calendar").waitFor();
  await page.waitForTimeout(600);
  await page.goto(BASE + "/app");
  await page.locator(".callist .ps-event").first().waitFor();
  if (await page.locator(".ps-erow", { hasText: "Dentist" }).count())
    fail("a removed personal entry should be off the coach's calendar");
  console.log("personal remove ok (the sheet asks, and the row goes)");
}

// Swiping a row right-to-left flips the same mark, without opening the class.
// The gesture came over with the week it used to live on: the peek is where
// saving happens now, so it is where the cheapest way to save belongs.
{
  await fan.goto(BASE + "/week");
  await openPeek(fan, "Matt");
  const rows = fan.locator(".peeksheet .swiperow");
  await rows.first().waitFor();
  // Find one that is not already saved; the first is, from the block above.
  const idx = await rows.evaluateAll((els) =>
    els.findIndex((e) => !e.querySelector(".peekadd.on")),
  );
  if (idx < 0) fail("expected an unsaved row in the peek to swipe");
  const row = rows.nth(idx);
  const before = await fan.locator(".peekadd.on").count();
  const box = await row.boundingBox();
  const y = box.y + box.height / 2;
  const from = box.x + box.width - 20;
  await fan.mouse.move(from, y);
  await fan.mouse.down();
  // past the 78px commit point, in steps so the drag is decided as horizontal
  for (const step of [35, 70, 100, 120]) await fan.mouse.move(from - step, y, { steps: 3 });
  await fan.mouse.up();
  await row.locator(".peekadd.on").waitFor();
  // a swipe must not also open the class
  if (await fan.locator(".classoverlay").count()) fail("the swipe opened the class");
  // ...and it is on the server, not just in the tab
  await fan.reload();
  await openPeek(fan, "Matt");
  const marked = await fan.locator(".peekadd.on").count();
  if (marked !== before + 1)
    fail(`swipe should have saved one more, ${before} -> ${marked}`);
  // swipe the same row again to take it back
  const row2 = fan.locator(".peeksheet .swiperow").nth(idx);
  const b2 = await row2.boundingBox();
  const y2 = b2.y + b2.height / 2;
  const from2 = b2.x + b2.width - 20;
  await fan.mouse.move(from2, y2);
  await fan.mouse.down();
  for (const step of [35, 70, 100, 120]) await fan.mouse.move(from2 - step, y2, { steps: 3 });
  await fan.mouse.up();
  await row2.locator(".peekadd.on").waitFor({ state: "detached" });
  await fan.reload();
  await openPeek(fan, "Matt");
  const after = await fan.locator(".peekadd.on").count();
  if (after !== before) fail(`swiping back should return to ${before}, got ${after}`);
  await shutPeek(fan);
}
console.log("swipe to save ok (right-to-left on the peek, both ways, survives reload)");

// the share image renders from their attendance, not a coach's schedule
const myStory = await fan.request.get(`${BASE}/api/story/me?theme=paper`);
if (!myStory.ok()) fail("member story image failed: " + myStory.status());
const myBuf = Buffer.from(await myStory.body());
if (myBuf.length < 5000) fail("member story image suspiciously small");
if (myBuf.readUInt32BE(16) !== 1080 || myBuf.readUInt32BE(20) !== 1920)
  fail("member story image is not 1080x1920");
// sharing them lives in the member's account, not on top of their week
if (await fan.locator(".goingshare").count())
  fail("Share my week should have moved off the feed");
// The You tab is the person; the calendar is the Schedule tab next door,
// and the gear is gone from the corner because You is the door now.
if (await fan.locator(".settingsbtn").count())
  fail("the gear should have left the corner: the You tab is the door");
await fan.locator(".brandbar-actions .usericon").click();
await fan.waitForURL("**/you");
await fan.locator(".acctwho").waitFor();
await fan.getByRole("button", { name: "Share", exact: true }).click();
await fan.locator(".sheet .setrow", { hasText: "Schedule story" }).click();
await fan.getByRole("heading", { name: "Share your plans" }).waitFor();
await fan.locator(".storyimg").waitFor();
await fan.locator(".adderclose").click();
// the wordmark is the way back to the feed from anywhere
await fan.locator(".brandbar-home").click();
await fan.waitForURL("**/week");
console.log("going + share my week ok (1080x1920 png, from the account)");

// ---- The member's tabs: the four they always were, with the directory
// called Discover again.
{
  // The You tab carries the viewer's initial inside it, so match by
  // inclusion rather than the joined string.
  const tabs = (await fan.locator(".navtab").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  // Two, since Following collapsed into Schedule: it was a merged week of the
  // coaches you follow, and a follow delivers a face on the calendar now
  // rather than a week of its own.
  if (tabs.length !== 2 || !tabs[0].includes("Discover") || !tabs[1].includes("Schedule"))
    fail("a member's tabs should read Discover, Schedule: " + tabs.join("|"));
  // You is the header's face now, not a tab: a person is not a place.
  if (!(await fan.locator(".brandbar-actions .usericon").count()))
    fail("the header should carry the viewer's face as the way to You");
  console.log("member tabs ok (two, and You is the corner)");
}

// the merged weekly digest: one "Your week" email covering every coach they
// follow, instead of one email per coach
const fanDigestCount = () =>
  (readLog().match(/\[mail:weekly_schedule\] to=lindley@example\.com/g) || []).length;
const digestBefore = fanDigestCount();
let dcron = await fan.request.get(`${BASE}/api/cron/weekly?key=${CRON_KEY}`);
if (!dcron.ok()) fail("weekly cron failed (digest): " + dcron.status());
await new Promise((r) => setTimeout(r, 600));
const fanDigests = fanDigestCount() - digestBefore;
// exactly one email, no matter how many coaches they follow — that's the point
if (fanDigests !== 1) fail(`expected exactly 1 merged digest, got ${fanDigests}`);
const digestBlock = readLog().split("[mail:weekly_schedule] to=lindley@example.com").pop() || "";
if (!/Barbell Strength/.test(digestBlock)) fail("merged digest missing the class");
if (!/Your week/.test(digestBlock)) fail("merged digest missing the subject");
console.log("merged digest ok (one email across coaches)");

// stopping the digest must NOT unfollow anyone — the feed stays intact
const digestUnsub = (digestBlock.match(/\/u\/digest\/[A-Za-z0-9._-]+/) || [])[0];
if (!digestUnsub) fail("merged digest has no unsubscribe link");
await fan.goto(BASE + digestUnsub);
await fan.getByText("No more weekly emails.").waitFor();
// Still following: the face is still on their calendar, which is the whole
// visible consequence of a follow now.
await fan.goto(BASE + "/week");
await fan.locator(".trayitem", { hasText: "Matt" }).waitFor();
const afterOptOut = fanDigestCount();
dcron = await fan.request.get(`${BASE}/api/cron/weekly?key=${CRON_KEY}`);
if (!dcron.ok()) fail("weekly cron failed (post opt-out): " + dcron.status());
await new Promise((r) => setTimeout(r, 600));
if (fanDigestCount() !== afterOptOut) fail("digest opt-out ignored");
console.log("digest opt-out ok (email stops, follows survive)");

// the directory opt-out: off means gone from Find coaches, page still public.
// Checked from the fan's browser — a coach never sees themselves listed.
await openProfile(page);
await openSetting(page, "Privacy & reach");
await page.locator(".sheet .setrow", { hasText: "Listed in Discover" }).click();
await page.locator(".setrow", { hasText: "only people with your link" }).waitFor();
await discHalf(fan);
if (await fan.locator(".disrow", { hasText: "Matt" }).count())
  fail("opted-out coach still listed in the directory");
const pub = await fan.request.get(`${BASE}/matt`);
if (!pub.ok()) fail("opting out of the directory broke the public page");
await openProfile(page);
await openSetting(page, "Privacy & reach");
await page.locator(".sheet .setrow", { hasText: "Listed in Discover" }).click();
await page.locator(".setrow", { hasText: "People can find you" }).waitFor();
await discHalf(fan);
await fan.locator(".disrow", { hasText: "Matt" }).waitFor();
await fanCtx.close();
console.log("directory opt-out ok (delisted, page still public)");

// A coach following another coach: two separate spaces. Their own schedule
// stays what they teach, and who they follow is a face on it that never leaks
// publicly.
await page.goto(BASE + "/sam");
await page.locator(".profacts .followpill", { hasText: "Follow" }).click();
await page.locator(".profacts .followpill", { hasText: "Following" }).waitFor();
await page.goto(BASE + "/app");
// A coach's tray is a member's tray: following is one idea, not two.
await openPeek(page, "Sam");
await page.locator(".peekrow-go").first().click();
await page.locator(".ovcta-save").click();
await page.locator(".ovcta-save.on").waitFor();
await page.locator(".ovcircle-back").click();
await page.waitForFunction(() => !document.querySelector(".classoverlay"));
// ...and it lands on their own calendar, beside what they teach.
await page.goto(BASE + "/app");
await page.locator(".callist .ps-event.ev-added").first().waitFor();

// But they cannot attend what they teach, and the row says so by offering
// nothing rather than an Add that setGoing would refuse. The swipe that used
// to teach this lived on the merged week; it is on the peek now, which is
// always somebody else's week, so there is no longer a way to aim the gesture
// at your own class at all. The refusal in setGoing stands behind that.
{
  const own = page
    .locator(".callist .ps-erow")
    .filter({ hasText: "Barbell Strength" })
    .first();
  await own.locator(".ps-event.ev-coaching").waitFor();
  if (!/teaching/i.test(await own.locator(".ps-chip").innerText()))
    fail("your own class should say Teaching in the corner");
  if (await own.locator("button.evcard-add, .ps-eadd").count())
    fail("your own class should offer no Add: setGoing refuses it");
  const marked = await page.locator(".callist .ps-event.ev-added").count();
  if (!marked) fail("the followed coach's class should be the marked one");
}
console.log("own classes ok (teaching offers no Add, the followed one saved)");

// and the coach's calendar holds both hats now: the class they added rides
// along with what they teach, wearing the Going green and the coach's face,
// and tapping it opens the class sheet rather than the editor.
await page.goto(BASE + "/app");
await page.locator(".ps-event").first().waitFor();
{
  const going = page.locator(".ps-event.ev-added", { hasText: "Conditioning" }).first();
  await going.waitFor();
  if (!(await going.locator(".ps-eav").count()))
    fail("a Going row should carry the coach's face");
  await going.click();
  await page.locator(".classoverlay-nm", { hasText: "Conditioning" }).waitFor();
  await page.locator(".ovcircle-back").click();
  await page.waitForFunction(() => !document.querySelector(".classoverlay"));
  // And their teaching rows wear the Teaching orange, so the hats read apart.
  if (!(await page.locator(".ps-event.ev-coaching").first().count()))
    fail("a teaching row should wear the Teaching colour");
  // The corner badges are gone: the colour is the badge.
  if (await page.locator(".ps-corner").count())
    fail("the corner badges should have become the card colours");
}
// The filters live behind the header's filter glyph now: a sheet of
// switches, one per kind the calendar holds, each wearing its colour as a
// dot. Everything starts on; a switch off narrows the list.
{
  if (await page.locator(".kindchecks").count())
    fail("the pill rail should have moved into the filter sheet");
  await page.locator(".calfilter").click();
  await page.getByRole("heading", { name: "Show on your calendar" }).waitFor();

  // A kind you have none of gets a line rather than a switch: a filter over
  // nothing can only hide nothing, so the row says what would be there and
  // hands over the way to put something in it. This coach teaches and goes
  // to classes and has nothing personal, so that is the one offered.
  {
    const empty = page.locator(".kindempty", { hasText: "personal calendar" });
    await empty.waitFor();
    if (await page.locator(".kindempty .switch").count())
      fail("an empty kind should offer a way in, not a switch that hides nothing");
    await empty.locator(".kindempty-a").click();
    await page.locator(".adderhead").waitFor();
    await page.locator(".adderclose").click();
    await page.waitForTimeout(400);
    await page.locator(".calfilter").click();
    await page.getByRole("heading", { name: "Show on your calendar" }).waitFor();
  }

  const rows = (await page.locator(".sheet .setrow").allInnerTexts()).map((t) => t.trim());
  if (!rows.includes("Teaching") || !rows.includes("Going"))
    fail("the sheet should list the kinds the calendar holds: " + rows.join("|"));
  if (!(await page.locator('.setrow[data-kind="coaching"] .kindfilter-dot').count()))
    fail("a filter row should wear its kind's dot");
  if (await page.locator(".sheet .setrow .switch:not(.on)").count())
    fail("every switch should start on");
  // Going off drops the class they only attend and keeps the taught rows.
  await page.locator('.setrow[data-kind="added"]').click();
  await page.locator(".sheetclose").click();
  await page.waitForFunction(() => !document.querySelector(".ps-event.ev-added"));
  if (!(await page.locator(".ps-event.ev-coaching").first().count()))
    fail("switching Going off should keep the taught rows");
  // The switches flip independently: Going back on, Teaching off.
  await page.locator(".calfilter").click();
  await page.locator('.setrow[data-kind="added"]').click();
  await page.locator('.setrow[data-kind="coaching"]').click();
  await page.locator(".sheetclose").click();
  await page.locator(".ps-event.ev-added", { hasText: "Conditioning" }).first().waitFor();
  if (await page.locator(".ps-event.ev-coaching").count())
    fail("switching Teaching off should drop the taught rows");
  await page.locator(".calfilter").click();
  await page.locator('.setrow[data-kind="coaching"]').click();
  await page.locator(".sheetclose").click();
  await page.locator(".ps-event.ev-coaching").first().waitFor();
  console.log("kind filters ok (the sheet's switches narrow, the dots are the legend)");
}
// A Going row on your own schedule carries the filled ribbon, and tapping it
// removes the class with the way back in the toast.
{
  const row = page.locator(".ps-erow").filter({ has: page.locator(".ps-event.ev-added") }).first();
  await row.locator(".evcard-add.on").waitFor();
  await row.locator(".evcard-add.on").click();
  await page.locator(".favtoast", { hasText: "Removed" }).waitFor();
  await page.waitForFunction(() => !document.querySelector(".ps-event.ev-added"), null, {
    timeout: 10000,
  });
  await page.locator(".favtoast .favtoast-link", { hasText: "Undo" }).click();
  await page.locator(".ps-event.ev-added").first().waitFor({ timeout: 10000 });
  console.log("schedule ribbon ok (remove with undo, and the undo means it)");
}
// The month view: the menu beside the month opens the view sheet, Month
// draws the grid with the same colours, and List is the way back.
{
  await page.locator(".calmenu").click();
  await page.getByRole("heading", { name: "View" }).waitFor();
  await page.locator(".sheet .setrow", { hasText: "Month" }).click();
  // The months stack now, so there are many grids; the first will do.
  await page.locator(".monthgrid").first().waitFor();
  if ((await page.locator(".monthblock").count()) < 10)
    fail("the month view should stack a scroll of months");
  if (await page.locator(".monthnav").count()) fail("the month chevrons should be gone");
  if (!(await page.locator(".monthpill.ev-coaching").first().count()))
    fail("the month grid should draw teaching pills in the teaching colour");
  console.log("month view ok (the sheet switches, the grid wears the colours)");
}
// The day view: the week strip in the chrome, the day as an hour grid, and
// a weekly class findable on its weekday. The view button wears the current
// view's own glyph, so it changes as the view does.
{
  await page.locator(".calmenu").click();
  await page.locator(".sheet .setrow", { hasText: "hour by hour" }).click();
  await page.locator(".daystrip").waitFor();
  await page.locator(".daygrid").waitFor();
  if ((await page.locator(".daystrip-day").count()) !== 7)
    fail("the day strip should hold the whole week");
  if (!(await page.locator(".daystrip-day.sel").count()))
    fail("the strip should mark the selected day");
  // Barbell Strength runs Mon, Wed & Fri, so walking the strip finds it.
  let found = false;
  for (let i = 0; i < 7; i++) {
    await page.locator(".daystrip-day").nth(i).click();
    await page.waitForTimeout(150);
    if (await page.locator(".daygrid-ev.ev-coaching").count()) {
      found = true;
      break;
    }
  }
  if (!found) fail("a weekly class should appear on its weekday in the day grid");
  await page.locator(".calmenu").click();
  await page.locator(".sheet .setrow", { hasText: "List" }).click();
  await page.locator(".ps-daycol").first().waitFor();
  console.log("day view ok (the strip walks the week, the grid holds the class)");
}
// ---- Home is parked, so nobody gets a fifth tab, admin or not. The feed it
// used to carry lives at /activity, behind the header's heartbeat.
{
  await page.goto(BASE + "/app");
  const tabs = (await page.locator(".navtab").allInnerTexts()).map((t) =>
    t.replace(/[ \t\n]+/g, " ").trim(),
  );
  if (tabs.length !== 2 || tabs.some((t) => /Home|Following/.test(t)))
    fail("two tabs, neither of them Home nor Following: " + tabs.join("|"));
  console.log("home is gone ok (two tabs for everyone)");
}

// with the bottom nav to cross between the two spaces
// No dead ends. A class opened from a list is a sheet, so closing it is the
// whole way back: you never left.
await page.goto(BASE + "/app");
await openPeek(page, "Sam");
await page.locator(".peekrow-go").first().click();
await page.locator(".classoverlay-nm").waitFor();
await page.locator(".ovcircle-back").click();
await page.waitForFunction(() => !document.querySelector(".classoverlay"));
await page.locator(".peeksheet").waitFor();
if (!page.url().endsWith("/app")) fail("opening a class shouldn't navigate: " + page.url());
await shutPeek(page);
await page.goto(BASE + "/sam/schedule");
{
  const href = await page.locator(".ps-event").first().getAttribute("href");
  await page.goto(BASE + href);
}
// The page wears the same overlay the lists open: same name block, same back
// circle, named for where it returns to.
await page.locator(".classoverlay-nm").waitFor();
if (!(await page.getByRole("button", { name: /Back to .*schedule/ }).count()))
  fail("a class page opened cold should back into the coach's page");
// a class with no booking link says nothing rather than a line of filler
if (await page.getByText("Just show up").count())
  fail("the no-booking line should be gone");
// The preference test above restored light before the rest of the suite. That
// restored viewer choice should still win on somebody else's page.
await page.goto(BASE + "/sam");
await page.locator(".pub").waitFor();
if (await page.locator('[data-mode="dark"]').count())
  fail("another coach's page should reflect the restored light preference");
console.log("another coach's page follows the viewer's restored light preference");

// ---- studios have their own page, and any coach can correct one
// The editor sits behind the three dots and a word about care: menu, then
// "Before you edit", then the form.
// The commons editor opens from the Edit pill beside the dots now; the
// dots only carry the pencil on a claimed page, for its managers.
const openStudioEditor = async (p) => {
  await p.locator(".owneredit").click();
  await p.getByRole("heading", { name: "Before you edit" }).waitFor();
  await p.getByRole("button", { name: "Continue to edit" }).click();
  await p.getByRole("heading", { name: "Edit studio" }).waitFor();
};
await page.goto(BASE + "/matt/studios");
await page.locator(".coachstudio", { hasText: "Ironbound Strength" }).click();
await page.waitForURL("**/s/ironbound-strength");
await page.locator(".profname", { hasText: "Ironbound Strength" }).waitFor();
await openStudioEditor(page);
await page.locator(".typepick .chip", { hasText: "Strength" }).first().click();
await page.locator(".typepick .chip", { hasText: "HYROX" }).click();
await page.locator("#stAbout").fill("Platforms, a turf strip and a sled track.");
await page.locator("#stEmail").fill("hello@ironbound.example");
await page.locator("#stInsta").fill("@ironboundstrength");
await page.getByRole("button", { name: "Save studio" }).click();
await page.getByText("Studio updated").waitFor();
// The commons built this page a week: matt's public class here gives the
// unclaimed studio a community schedule, so the page wears tabs and the
// About content lives behind About.
await page.goto(BASE + "/s/ironbound-strength");
await page.locator(".pubtab.sel", { hasText: "Schedule" }).waitFor();
await page.locator(".pubtab-info").waitFor();
{
  const row = page.locator(".ps-event", { hasText: "Barbell Strength" }).first();
  await row.waitFor();
  const href = await row.getAttribute("href");
  if (!href?.startsWith("/matt/"))
    fail("a coach's community row should open their own class: " + href);
}
await page.goto(BASE + "/s/ironbound-strength/about");
{
  const types = await page.locator(".studiotype").allInnerTexts();
  if (types.join("|") !== "Strength|HYROX") fail("studio types didn't stick: " + types.join(","));
}
await page.getByText("Platforms, a turf strip").waitFor();
// The @ comes off the handle, and the ways to reach it render from what was
// saved. They live behind the header's Contact pill now, the same door a
// person's page carries, and there is no fittlist row: a studio has no
// account to be written to.
{
  await page.locator(".profacts .actpill-primary", { hasText: "Contact" }).click();
  await page.locator(".sheet .contactlist").waitFor();
  if (await page.locator(".sheet .proflink-first").count())
    fail("a studio has no inbox, so nothing should offer to message it");
  await expect(
    page.locator('.sheet .proflink[href="https://instagram.com/ironboundstrength"]').isVisible(),
    "studio instagram link",
  );
  await expect(page.locator('.sheet .proflink[href^="mailto:"]').isVisible(), "studio email link");
  await page.locator(".sheet .sheetclose").click();
  await page.waitForFunction(() => !document.querySelector(".sheet"));
}
// renaming moves the slug, and the old address still resolves by id
{
  const before = page.url();
  await openStudioEditor(page);
  await page.locator("#stName").fill("Ironbound Strength & Conditioning");
  await page.getByRole("button", { name: "Save studio" }).click();
  await page.waitForURL("**/s/ironbound-strength-conditioning");
  if (page.url() === before) fail("renaming a studio should move its slug");
  await openStudioEditor(page);
  await page.locator("#stName").fill("Ironbound Strength");
  await page.getByRole("button", { name: "Save studio" }).click();
  await page.waitForURL("**/s/ironbound-strength");
}
// A studio's photo is a rectangle across the top, not a circle: the shape is
// what tells a place from a person at a glance. Without one, the coloured
// circle face stays, because a full-width empty rectangle is a wall.
{
  // No photo yet: the banner space is already there, in the studio's own
  // colour, so both layouts are one layout.
  await page.locator(".profbanner-empty").waitFor();
  if (await page.locator(".pubhead .profav").count())
    fail("the colour block replaced the circle face");
  await openStudioEditor(page);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.locator('.sheet input[type="file"]').setInputFiles({
    name: "room.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Save studio" }).click();
  await page.locator("img.profbanner").waitFor();
  if (await page.locator(".profbanner-empty").count())
    fail("the colour block should make way for the photo");
  // Nobody has claimed this one, and the page says so on the picture: the
  // Unverified badge rides the banner's bottom-left and explains itself.
  await page.locator(".profbadges-onbanner .studiokept", { hasText: "Unverified" }).waitFor();
  await page.locator(".studiokept", { hasText: "Unverified" }).click();
  await page.getByRole("heading", { name: "Unverified" }).waitFor();
  // Get in touch is an ask to own the page, not the corrections form: its
  // own sheet, needing an email and an owner or manager claim.
  await page.getByRole("button", { name: "Get in touch" }).click();
  await page.getByRole("heading", { name: "Own this page" }).waitFor();
  if (!(await page.getByRole("button", { name: "Ask to own this page" }).isDisabled()))
    fail("the claim should wait for an email and a connection");
  await page.locator(".sheetclose").last().click();
  await page.waitForFunction(() => !document.querySelector(".sheet"));
  console.log("studio photo is a banner ok (full bleed, Unverified riding it)");
}
// The way out. A coach adding a studio put it here, and that is not the
// studio agreeing to be here: the dots offer the people who run the place a
// door to ask for the page to come down, signed in or not.
{
  await page.locator(".ownermore").click();
  await page.locator(".ownermenu .setrow", { hasText: "Take this page down" }).click();
  await page.getByRole("heading", { name: "Take this page down" }).waitFor();
  // The ask needs a claim and a way to reply, or it can't be honoured.
  if (!(await page.getByRole("button", { name: "Ask us to take it down" }).isDisabled()))
    fail("the ask should wait for an email and a claim");
  await page.locator("#ooName").fill("Jenny Ramos");
  await page.locator("#ooEmail").fill("jenny@ironbound.example");
  await page.locator(".relpick .relchip", { hasText: "I own it" }).click();
  await page.getByRole("button", { name: "Ask us to take it down" }).click();
  await page.getByText("Thanks. We'll be in touch and take it down.").waitFor();
  console.log("studio opt-out ok (the ask rides the suggestion pipe to the admin)");
}
// a class points at the studio's page, not straight at a map — in the sheet
// as well as on the page behind it. The owner's own rows open the editor now,
// so the sheet is asserted from a fresh visitor context.
{
  const stCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (smoke studio bot)",
  });
  const st = await stCtx.newPage();
  st.setDefaultTimeout(10000);
  await st.goto(BASE + "/matt/schedule");
  await st.locator(".ps-event").first().click();
  await st.locator(".classoverlay-nm").waitFor();
  await st.locator(".classoverlay .evfact", { hasText: "Ironbound Strength" }).click();
  await st.waitForURL("**/s/ironbound-strength");
  await stCtx.close();
}
console.log("studio pages ok (edit, types, slug follows the name)");

// a profile is a screen of the app: the header floating over the picture, no
// tab bar, and the arrow on the picture as the way off it
await discHalf(page);
await page.locator(".disrow-main", { hasText: "Sam" }).click();
await page.locator(".profname").waitFor();
if (!(await page.locator(".profacts .followpill").count()))
  fail("Follow should sit in the actions row under the name");
if (await page.locator(".profshare").count()) fail("the share button should be gone");
// Signed in, this is still the app, so the header comes with it: over the
// picture rather than above it, and scrolling away with it. The tab bar does
// not: three layers of chrome over a schedule is most of a phone screen, and
// the arrow is the way off instead.
if (!(await page.locator(".profwrap > .brandbar").count()))
  fail("a signed-in viewer should get the app header on a profile");
if (await page.locator(".navbar").count())
  fail("a profile carries no tab bar: the arrow on the picture is the way off");
if (!(await page.locator(".pubhead .evback").count()))
  fail("a profile reached from a list should offer the way back to it");
// The head scrolls away and the row holding the name and the tabs is what
// pins, so neither of those two is a sticky element itself: the wrapper around
// them is.
await expect(
  page.locator(".pubhead").evaluate((e) => getComputedStyle(e).position !== "sticky"),
  "the head is not pinned",
);
await expect(
  page.locator(".pubstick").evaluate((e) => getComputedStyle(e).position === "sticky"),
  "the name and the tabs are what pins",
);
// The way off a profile is the arrow on the picture, however you arrived.
await page.locator(".profback .evback").click();
await page.waitForURL(/\/discover/);
// the selected tab is a filled pill again (the underline came and went; the
// pill is the design)
await page.goto(BASE + "/matt");
await page.locator(".pubtab.sel").waitFor();
{
  // Underlines, not pills: under the two action pills and over the card list,
  // a third row of pills was pills on pills. Selected is ink with a rule.
  const t = await page.locator(".pubtab.sel").evaluate((e) => {
    const cs = getComputedStyle(e);
    return {
      bg: cs.backgroundColor,
      radius: parseFloat(cs.borderRadius),
      under: cs.borderBottomWidth,
    };
  });
  if (t.bg !== "rgba(0, 0, 0, 0)") fail("the selected tab should not be a filled pill: " + t.bg);
  if (t.radius > 0) fail("the tabs should not be pill shapes, radius " + t.radius);
  if (parseFloat(t.under) < 2) fail("the selected tab should carry an underline, got " + t.under);
}
// ---- tabs are anchor navigation over one continuous profile
{
  const hrefs = await page
    .locator(".pubtabs a")
    .evaluateAll((els) => els.map((e) => new URL(e.href).hash));
  const want = ["#profile-schedule", "#profile-about", "#profile-studios"];
  if (hrefs.join("|") !== want.join("|"))
    fail("tabs should link to " + want.join(", ") + ", got " + hrefs.join(", "));
  // Legacy section URLs still resolve, but carry the complete profile.
  await page.goto(BASE + "/matt/about");
  await page.locator(".pubtab.sel", { hasText: "Schedule" }).waitFor();
  await page.locator(".profabout").waitFor();
  if (!(await page.locator(".ps-event").count())) fail("the unified profile should keep its schedule");
  // The old /contact link still resolves: people have already sent it. It
  // lands on the schedule, with the Contact pill right there.
  await page.goto(BASE + "/matt/contact");
  await page.locator(".pubtab.sel", { hasText: "Schedule" }).waitFor();
  // And back to the schedule, which is the bare handle.
  await page.goto(BASE + "/matt/about");
  await page.locator(".pubtab", { hasText: "Schedule" }).click();
  await page.locator(".ps-event").first().waitFor();
  // The old /schedule link still resolves: people have already sent it.
  await page.goto(BASE + "/matt/schedule");
  await page.locator(".pubtab.sel", { hasText: "Schedule" }).waitFor();
  await page.locator(".ps-event").first().waitFor();
}
console.log("profile anchor tabs ok (one page, three sections)");

// Settings are the You tab now; the profile carries no door to somewhere
// else, and the corner carries no gear.
{
  await page.goto(BASE + "/matt");
  await page.locator(".pubhead").waitFor();
  if (await page.locator(".ownergear").count())
    fail("the profile should carry no gear; the You tab is the door");
  if (await page.locator(".ownermore").count())
    fail("the three-dot menu belongs to a studio, not a person");
  console.log("profile settings ok (no gear anywhere; the You tab is the door)");
}

// The account is a tab: tapping You from the calendar opens it, the bar
// stays, and Schedule is the way back.
{
  await page.goto(BASE + "/app");
  await page.locator(".caladd").waitFor();
  if (await page.locator(".settingsbtn").count())
    fail("the gear should have left the corner: the You tab is the door");
  await page.locator(".brandbar-actions .usericon").click();
  await page.waitForURL("**/you");
  await page.locator(".acctwrap").waitFor();
  if (!(await page.locator(".navbar").count())) fail("the You tab keeps the bar");
  await page.locator(".navtab", { hasText: "Schedule" }).click();
  await page.waitForURL(/\/app/);
  await page.locator(".caladd").waitFor();
  console.log("you tab ok (the account is a tab, the bar stays, Schedule is the way back)");
}

// The owner gets two pills where a visitor gets Message and Follow: Share
// filled, Edit profile outline. Every way of sharing lives behind the first.
{
  await page.goto(BASE + "/matt");
  const pills = page.locator(".profacts .actpill");
  await pills.first().waitFor();
  const labels = await pills.allInnerTexts();
  if (labels.length !== 2 || !/Share/.test(labels[0]) || !/Edit profile/.test(labels[1]))
    fail("expected Share then Edit profile: " + JSON.stringify(labels));
  const filled = await pills.first().evaluate((e) => e.classList.contains("actpill-primary"));
  const outline = await pills.nth(1).evaluate((e) => e.classList.contains("actpill-primary"));
  if (!filled || outline) fail("Share should be the filled one and Edit the outline");
  // On paper: the filled pill is ink with light words, the outline dark ink.
  {
    const ink = await pills.evaluateAll((els) => els.map((e) => getComputedStyle(e).color));
    if (ink[0] === "rgb(17, 17, 17)") fail("the filled pill's words should be light: " + ink[0]);
    if (ink[1] === "rgb(255, 255, 255)") fail("the outline pill's ink should be dark: " + ink[1]);
  }

  await pills.first().click();
  await page.getByRole("heading", { name: "Share your page" }).waitFor();
  const rows = await page.locator(".sheet .settingslist .setrow .t").allInnerTexts();
  for (const want of ["Share your schedule", "Copy your link", "Your QR code", "Copy your week"])
    if (!rows.includes(want)) fail(`the share sheet is missing ${want}: ${rows.join(", ")}`);
  // Copying the link is the one people reach for, so prove it actually copies.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await page.locator(".setrow", { hasText: "Copy your link" }).click();
  await page.getByText("Link copied, ready to paste").waitFor();
  if (!(await page.evaluate(() => navigator.clipboard.readText())).endsWith("/matt"))
    fail("Copy your link copied the wrong thing");

  // And Edit profile still opens the editor it always did.
  await page.locator(".profacts .actpill").nth(1).click();
  await page.getByRole("heading", { name: "Edit profile" }).waitFor();
  await page.locator(".sheetclose").first().click();
  console.log("owner CTAs ok (Share filled, Edit outline, every share behind one)");
}
// The two pills sit on the photograph now, so they're white against it:
// Contact filled, Follow outlined, and following fills Follow in. Matt already
// follows Sam by this point, so settle the state first rather than assuming.
await discHalf(page);
await page.locator(".disrow-main", { hasText: "Sam" }).click();
await page.locator(".profacts .followpill").waitFor();
if ((await page.locator(".profacts .followpill").innerText()).trim() !== "Following") {
  await page.locator(".profacts .followpill").click();
  await page.locator(".profacts .followpill", { hasText: /^Following$/ }).waitFor();
}
{
  // Following is green: the same yes as a Going mark, and that meaning is
  // worth more than matching the outline beside it.
  const read = () =>
    page.locator(".profacts .followpill").evaluate((e) => {
      const s = getComputedStyle(e);
      return { bg: s.backgroundColor, color: s.color };
    });
  const on = await read();
  if (!/^rgb\(6[0-5], 1[0-9]{2}, 8[0-9]\)/.test(on.bg) && on.bg !== "rgb(61, 139, 83)")
    fail("Following should be green, got " + on.bg);
  if (on.color !== "rgb(255, 255, 255)") fail("Following should read in white, got " + on.color);
  // And unfollowed it is a quiet outline in ink, so the pair reads as one
  // thing you have done and one you haven't.
  await page.locator(".profacts .followpill").click();
  await page.locator(".profacts .followpill", { hasText: /^Follow$/ }).waitFor();
  const off = await read();
  if (off.bg !== "rgba(0, 0, 0, 0)") fail("Follow should be an outline, got " + off.bg);
  if (off.color === "rgb(255, 255, 255)") fail("Follow should read in ink, got " + off.color);
  // Put it back, so the rest of the suite finds the follow it expects.
  await page.locator(".profacts .followpill").click();
  await page.locator(".profacts .followpill", { hasText: /^Following$/ }).waitFor();
}
// Somebody else's page is not yours to configure: the only gear is the app
// header's own, which opens the viewer's settings and nobody else's.
if (await page.locator(".ownergear").count())
  fail("no settings door belongs on a page that isn't yours");

// The head is a circle of a face over a centred name: the full-bleed hero
// came and went, because a screen of photograph before any schedule said
// editorial when the product says calendar.
{
  await page.goto(BASE + "/matt");
  await page.locator(".pubhead .profav").waitFor();
  if (await page.locator(".profhero").count()) fail("the hero should be gone");
  // Tapping the face blows it up with the share actions under it.
  await page.locator(".avzoom-trigger").click();
  await page.locator(".avoverlay").waitFor();
  await page.locator(".avoverlay-close").click();
  await page.waitForFunction(() => !document.querySelector(".avoverlay"));
  // No label above the name, and one line for what they do and where.
  if (await page.locator(".pubhead .kindtag").count())
    fail("the head should carry no kind tag");
  const meta = await page.locator(".pubhead .profmeta").innerText();
  if (!meta.includes("Strength coach") || !meta.includes("Jersey City"))
    fail("the meta line should carry the title and the city, got " + meta);
  console.log("profile head ok (circle face, zoom overlay, one meta line)");
}
console.log("profile chrome ok (pinned row, no header or tabs, green Following)");

// Two tabs, admin or not: the bar is Discover and Schedule. Share and You
// have both left it, and Following went with the merged week it pointed at.
// Back in the app, since a profile carries no bar at all.
await page.goto(BASE + "/app");
await page.locator(".caladd").waitFor();
{
  const n = await page.locator(".navtab").count();
  if (n !== 2) fail("expected 2 tabs, got " + n);
}
await openProfile(page);
await closeProfile(page);
// What a coach attends sits behind the Going half of their own page, on the
// same rule a member's week uses: open unless they have approve-first on.
{
  const mine = await (await page.request.get(`${BASE}/matt/schedule`)).text();
  if (!/Sam&#x27;s Conditioning|Sam's Conditioning/.test(mine))
    fail("a coach should see their own Going week");
}
console.log("coach following ok (the Going half of their own page)");

// ---- The other half of the rule: approve-first closes the week. It is the
// Instagram model and the one switch does both jobs, so gating who may follow
// gates what they see, and a stranger is told plainly rather than shown an
// empty page they could read as "nothing on".
{
  await openProfile(page);
  await openSetting(page, "Privacy & reach");
  await page.locator(".sheet .setrow", { hasText: "Account privacy" }).click();
  await page.waitForTimeout(700);
  const strangerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const seen = await (await strangerCtx.request.get(`${BASE}/matt/schedule`)).text();
  await strangerCtx.close();
  if (/Sam&#x27;s Conditioning|Sam's Conditioning/.test(seen))
    fail("approve-first should close the Going week to a stranger");
  // The coach's own teaching week stays public whatever this switch says: that
  // page is the product, and hiding it would break the one thing a link is for.
  if (!/Barbell Strength/.test(seen))
    fail("approve-first must not hide the classes a coach teaches");
  // Put it back, so what follows sees the account it expects.
  await page.locator(".sheet .setrow", { hasText: "Account privacy" }).click();
  await page.waitForTimeout(700);
  await closeProfile(page);
}
console.log("approve-first closes the week, and never the teaching page ok");

// ---- the Followers stat opens the list of who they are, and coaches among
// them can be followed back. Three shapes have to render: a coach (page, so a
// Follow back button), a member (account, no page), and a plain email
// subscriber (no account at all — the one that would blow up on a null user).
{
  const mailCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mailPg = await mailCtx.newPage();
  mailPg.setDefaultTimeout(10000);
  await mailPg.goto(BASE + "/matt");
  await mailPg.locator(".profacts .followpill").click();
  await mailPg.locator("#ntEmail").fill("mailonly@example.com");
  await mailPg.getByRole("button", { name: "Add me to the list" }).click();
  await mailPg.locator(".sheet h2", { hasText: "on Matt" }).waitFor();
  await mailCtx.close();
}
await anonPage.goto(BASE + "/matt");
await anonPage.locator(".profacts .followpill").waitFor();
if ((await anonPage.locator(".profacts .followpill").innerText()).trim() !== "Following") {
  await anonPage.locator(".profacts .followpill").click();
  await anonPage.locator(".profacts .followpill", { hasText: /^Following$/ }).waitFor();
}
await page.goto(BASE + "/app");
await page.goto(BASE + "/app?acct=1");
await page.locator(".acctwrap").waitFor();
await page.locator(".acctstats button.acctstat", { hasText: "Followers" }).click();
await page.waitForURL("**/followers");
await page.getByRole("heading", { name: "Followers" }).waitFor();
{
  // the number on the stat is the number of rows behind it
  const shown = await page.locator(".dislist .disrow").count();
  if (shown < 3) fail("followers list is missing rows, got " + shown);
  // an email-only subscriber is listed but has nobody to follow back
  const emailRow = page.locator(".disrow", { hasText: "mailonly@example.com" });
  await emailRow.waitFor();
  if (await emailRow.locator(".disfollow").count())
    fail("an email subscriber has no page — there's nothing to follow back");
  // a member has a profile to open, but following one would promise a week
  // that isn't there yet, so the row links without offering a button
  const memberRow = page.locator(".disrow", { hasText: "Lindley" });
  await memberRow.waitFor();
  if (!(await memberRow.locator("a.disrow-main").count()))
    fail("a member's row should link to their profile");
  if (await memberRow.locator(".disfollow").count())
    fail("following a member promises a week that doesn't exist yet");
  // a coach who follows you can be followed back, right from the row. Matt
  // already follows Sam by now, so unfollow first and watch it round-trip.
  const samBtn = page.locator(".disrow", { hasText: "Sam" }).locator(".disfollow");
  await samBtn.waitFor();
  if ((await samBtn.innerText()).trim() === "Following") await samBtn.click();
  await samBtn.filter({ hasText: "Follow back" }).waitFor();
  await samBtn.click();
  await page.locator(".disrow", { hasText: "Sam" }).locator(".disfollow.on").waitFor();
}
await page.screenshot({ path: SCRATCH + "/shot-followers.png", fullPage: true });
// back returns to the account it was opened from, which is the You tab now
await page.locator(".folback .evback").click();
await page.waitForURL((u) => u.pathname === "/you");
await page.locator(".acctwrap").waitFor();
await closeProfile(page);
console.log("followers list ok (email subscriber listed, coach can be followed back)");

// the three stats read as a column: number centred over its label
{
  await page.goto(BASE + "/app");
  await page.goto(BASE + "/app?acct=1");
  await page.locator(".acctstat").first().waitFor();
  const off = await page.locator(".acctstat").first().evaluate((el) => {
    const box = el.getBoundingClientRect();
    const n = el.querySelector(".n").getBoundingClientRect();
    const l = el.querySelector(".l").getBoundingClientRect();
    return {
      n: Math.abs(n.left + n.width / 2 - (box.left + box.width / 2)),
      l: Math.abs(l.left + l.width / 2 - (box.left + box.width / 2)),
    };
  });
  if (off.n > 1.5 || off.l > 1.5) fail(`stats are not centred: ${JSON.stringify(off)}`);
  await closeProfile(page);
}
console.log("stats centred ok");

// Settings holds only what has no other door. The Following tab already IS
// the coach's week, and sharing what you're attending is a member's move, so
// neither belongs in a coach's settings list.
await openProfile(page);
// Exact: the row this guards against was literally titled "Your week", and a
// substring match also catches rows that merely mention one.
if (await page.locator(".setrow .t", { hasText: /^Your week$/ }).count())
  fail("the Following tab already is your week — settings shouldn't repeat it");
if (await page.locator(".setrow", { hasText: "attending" }).count())
  fail("a coach's share is their own schedule, not what they're going to");
// Every row but the first has a divider. Three rows come from components that
// render a Toast beside the row, and the old `.setrow + .setrow` rule needed
// them to be adjacent, so those three lost their line without a word.
{
  // Settings is several grouped cards now; check the divider rule inside
  // every one of them, and that at least one card has enough rows to prove it.
  const lines = await page.locator(".acctwrap").evaluate((wrap) =>
    [...wrap.querySelectorAll(".settingslist")].flatMap((list) =>
      [...list.querySelectorAll(":scope > .setrow")].map((r, i) => ({
        row: r.querySelector(".t")?.textContent ?? "?",
        top: getComputedStyle(r).borderTopWidth,
        first: i === 0,
      })),
    ),
  );
  if (lines.filter((l) => !l.first).length < 3)
    fail("expected settings groups with several rows");
  for (const l of lines) {
    if (l.first && l.top !== "0px") fail(`the first row shouldn't have a divider: ${l.row}`);
    if (!l.first && l.top === "0px") fail(`${l.row} is missing its divider`);
  }
}
// the member side is still one tab away, and still theirs
await closeProfile(page);
await page.locator(".navtab", { hasText: "Discover" }).click();
await page.waitForURL(/\/discover/);
await page.locator(".navtab", { hasText: "Schedule" }).click();
await page.locator(".caladd").waitFor();
console.log("coach settings ok (no duplicate doors, member side still one tab away)");

// the coach's own avatar fills with their palette colour rather than tinting
// the letter on a grey disc
await openProfile(page);
{
  const av = await page.locator(".acctwho-av-empty, .acctwho-av").first().evaluate((el) => ({
    empty: el.classList.contains("acctwho-av-empty"),
    bg: getComputedStyle(el).backgroundColor,
  }));
  if (av.empty && (av.bg === "rgb(234, 227, 210)" || av.bg === "rgba(0, 0, 0, 0)"))
    fail("a photo-less account avatar should carry the coach's colour, got " + av.bg);
}
await closeProfile(page);
console.log("avatar colour ok (fills the circle)");

// ---- a visitor asks about private sessions. The unique index on the thread
// table gained a `kind` column when feedback moved onto it, and the insert here
// still named two of the three, so every request died on "no unique or
// exclusion constraint matching the ON CONFLICT specification". Nothing tested
// the send, so nothing said so.
// Availability lives in settings now, not in Edit profile: it decides whether
// anyone can ask at all, which is a switch rather than a bio field. It saves on
// the tap, and the row underneath says where it stands without opening.
await openProfile(page);
await page.waitForTimeout(450); // the account slides up
{
  await openSetting(page, "Your page");
  const row = page.locator(".sheet .setrow", { hasText: "Availability" });
  await row.scrollIntoViewIfNeeded();
  if (!(await row.innerText()).includes("Not shown"))
    fail("a new coach's availability should start hidden");
  await row.click();
  await page.locator(".availpick").waitFor();
  await page.locator(".availopt", { hasText: "Accepting" }).click();
  await page.locator(".availopt.sel", { hasText: "Accepting" }).waitFor();
  await page.locator(".sheet .sheetclose").click();
}
// It no longer shows on the profile. The hero is a photograph with a name on
// it, and a row of small tags over the top was the first thing to go when it
// got busy; the status still does its work in Discover's filter and in whether
// there's anything to say when somebody writes in.
{
  await page.goto(BASE + "/matt");
  await page.locator(".pubhead .profname").waitFor();
  if (await page.locator(".profbadges").count())
    fail("the hero should carry no tag row");
  if (await page.locator(".profname-row .availbadge").count())
    fail("the old status badge should have left the name row");
}
// Back on the account, the row reports it without being opened.
await page.goto(BASE + "/app");
await openProfile(page);
await page.waitForTimeout(450);
{
  await openSetting(page, "Your page");
  const row = page.locator(".sheet .setrow", { hasText: "Availability" });
  await row.scrollIntoViewIfNeeded();
  if (!(await row.innerText()).includes("Accepting new clients"))
    fail("the row should report the choice, got " + (await row.innerText()));
}
// And it's gone from Edit profile, where it used to be. Add a certification
// while we're in there: the next check needs something that can be wiped.
await page.goto(BASE + "/matt?edit=1");
await page.locator(".sheet").waitFor();
if (await page.locator(".sheet .availseg").count())
  fail("availability should have left the profile editor");
await page.getByPlaceholder("e.g. NASM CPT").fill("NASM CPT");
await page.getByPlaceholder("e.g. NASM CPT").press("Enter");
await page.locator(".sheet .publishwrap .btn").first().click();
await page.waitForFunction(() => !document.querySelector(".sheet"));
await page.goto(BASE + "/matt/about");
await page.getByText("NASM CPT").first().waitFor();
console.log("availability moved to settings ok");

// Saving one screen must not wipe another. updateProfile wrote availability,
// certifications and highlights on every call, so saving contact info cleared
// all three: the certifications vanished and the coach's page quietly lost its
// Request private session button. Same trap that ate the location once.
await openProfile(page);
await page.waitForTimeout(450);
await openSetting(page, "Your page");
await page.locator(".sheet .setrow", { hasText: "Contact info" }).click();
await page.locator("#cEmail").waitFor();
await page.locator("#cEmail").fill("matt@coach.example.com");
// The phone rides on this screen too, so it has to be re-stated here or the
// save clears it and the Contact sheet loses a row further down.
await page.locator("#cPhone").fill("+1 555 123 4567");
await page.getByRole("button", { name: "Save contact info" }).click();
await page.getByText("Contact info saved").waitFor();
await page.goto(BASE + "/matt/about");
await page.getByText("NASM CPT").first().waitFor();
// The owner never sees their own Request button, so availability is checked
// where it's stated. That it's still on is what lets the visitor below ask.
await openProfile(page);
await page.waitForTimeout(450);
{
  await openSetting(page, "Your page");
  const row = page.locator(".sheet .setrow", { hasText: "Availability" });
  await row.scrollIntoViewIfNeeded();
  if (!(await row.innerText()).includes("Accepting new clients"))
    fail("saving contact info cleared availability: " + (await row.innerText()));
}
await closeProfile(page);
console.log("saving contact info leaves the rest alone ok");
{
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const vp = await visitor.newPage();
  vp.setDefaultTimeout(10000);
  // The Contact pill is the one door, and it opens on the ways to reach them
  // with fittlist first: every other row hands the conversation to somebody
  // else's app.
  await vp.goto(BASE + "/matt");
  await vp.locator(".profacts .actpill-primary", { hasText: "Contact" }).click();
  await vp.locator(".sheet .contactlist").waitFor();
  {
    const rows = await vp.locator(".sheet .contactlist .proflink").allInnerTexts();
    if (!/fittlist/i.test(rows[0] ?? "")) fail("fittlist should lead the ways: " + rows.join(", "));
  }
  // Everything they saved is a row, and each one still points where it did
  // when this lived under a Contact tab.
  for (const [sel, what] of [
    ['[href="https://instagram.com/mattlifts"]', "instagram"],
    ['[href="https://mattlifts.com/"]', "website"],
    ['[href="mailto:matt@coach.example.com"]', "email"],
    ['[href^="tel:"]', "call"],
  ]) {
    await expect(vp.locator(`.sheet .proflink${sel}`).isVisible(), `the sheet shows ${what}`);
  }
  await vp.locator(".sheet .proflink-first").click();
  await vp.locator("#rqName").fill("Priya Visitor");
  await vp.locator("#rqEmail").fill("priya@example.com");
  // The phone is optional and stays optional: a second visitor sends without
  // one below, and the send has to go through either way.
  await vp.locator("#rqPhone").fill("555 867 5309");
  await vp.locator("#rqMsg").fill("Any Saturday mornings free for 1:1?");
  await vp.getByRole("button", { name: "Send to Matt" }).click();
  await vp.getByRole("heading", { name: "Message sent" }).waitFor();
  await vp.getByRole("button", { name: "Done" }).click();

  // A second one, no phone, from a cold open.
  await vp.goto(BASE + "/matt");
  await vp.locator(".profacts .actpill-primary", { hasText: "Contact" }).click();
  await vp.locator(".sheet .proflink-first").click();
  await vp.getByRole("heading", { name: "Message Matt" }).waitFor();
  await vp.locator("#rqName").fill("Theo Nophone");
  await vp.locator("#rqEmail").fill("theo@example.com");
  await vp.locator("#rqMsg").fill("Do you take beginners?");
  await vp.getByRole("button", { name: "Send to Matt" }).click();
  await vp.getByRole("heading", { name: "Message sent" }).waitFor();
  await visitor.close();
}
console.log("messages sent ok (the Contact sheet, twice)");

// ---- Messages is a switch of its own. Availability says whether you're taking
// private clients; this says whether anyone can write to you at all, and a
// coach whose books are full still wants the question about Tuesday's class.
await openProfile(page);
await page.waitForTimeout(450);
{
  await openSetting(page, "Privacy & reach");
  const row = page.locator(".sheet .setrow", { hasText: "Messages" });
  await row.scrollIntoViewIfNeeded();
  if ((await row.getAttribute("aria-pressed")) !== "true") fail("messages should start on");
  await row.click();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".sheet .setrow")]
        .find((r) => r.textContent?.includes("Messages"))
        ?.getAttribute("aria-pressed") === "false",
  );
}
await closeProfile(page);
{
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const vp = await visitor.newPage();
  vp.setDefaultTimeout(10000);
  await vp.goto(BASE + "/matt");
  await vp.locator(".profacts").waitFor();
  // The pill stays, because a coach's email and links are still ways to reach
  // them; what closes is the fittlist row inside it.
  await vp.locator(".profacts .actpill-primary", { hasText: "Contact" }).click();
  await vp.locator(".sheet .contactlist").waitFor();
  if (await vp.locator(".sheet .proflink-first").count())
    fail("messages off should take Message on fittlist out of the sheet");
  await vp.goto(BASE + "/matt");
  // Following is unaffected: not writing to someone is not not following them.
  if (!(await vp.locator(".profacts .followpill").count()))
    fail("Follow should survive messages being off");
  await visitor.close();
}
// back on, so the rest of the suite has a door to knock at
await openProfile(page);
await page.waitForTimeout(450);
await openSetting(page, "Privacy & reach");
await page.locator(".sheet .setrow", { hasText: "Messages" }).click();
// Scoped to the sheet: the Privacy & reach group row on the scroll behind it
// says "Messages off" in its subtitle, carries no aria-pressed, and sits
// earlier in the DOM, so an unscoped .setrow finds that one forever.
await page.waitForFunction(
  () =>
    [...document.querySelectorAll(".sheet .setrow")]
      .find((r) => r.textContent?.includes("Messages"))
      ?.getAttribute("aria-pressed") === "true",
);
await closeProfile(page);
console.log("messages switch ok (takes both doors off, leaves Follow alone)");

// ---- Requests is its own room: a list of people, what they asked, and how to
// reach them. It used to be reachable only through the messages tab, which made
// a request read as a chat.
await page.goto(BASE + "/requests");
{
  const cards = page.locator(".reqcard");
  await cards.first().waitFor();
  if ((await cards.count()) !== 2) fail("expected 2 requests, got " + (await cards.count()));
  const priya = page.locator(".reqcard", { hasText: "Priya" });
  const text = await priya.innerText();
  if (!text.includes("priya@example.com")) fail("a request should carry the email");
  if (!text.includes("555 867 5309")) fail("a request should carry the phone they left");
  if (!text.includes("Saturday mornings")) fail("a request should show what they asked");
  // The preview is what THEY wrote. A coach's own reply tells them nothing.
  const theo = page.locator(".reqcard", { hasText: "Theo" });
  if (!(await theo.innerText()).includes("beginners")) fail("Theo's message is missing");
  if ((await theo.locator('a[href^="tel:"]').count()) !== 0)
    fail("no phone was given, so there should be no number to call");
  if ((await priya.locator('a[href^="tel:"]').count()) !== 1) fail("Priya's number should be callable");
  // Unread until opened, and the card says so.
  if ((await page.locator(".reqcard.unread").count()) !== 2) fail("new requests should read as unread");
  await priya.getByRole("link", { name: /reply|thread/i }).click();
  await page.waitForURL(/\/inbox\/.+from=requests/);
  await page.getByText("Saturday mornings").waitFor();
  // The number rides along to the thread, and back goes where you came from.
  if (!(await page.locator(".chattop-ways").innerText()).includes("555 867 5309"))
    fail("the thread header should carry the phone");
  await page.locator(".chatback").click();
  await page.waitForURL(/\/requests/);
  if ((await page.locator(".reqcard.unread").count()) !== 1)
    fail("the one that was read should no longer be unread");
}
console.log("requests room ok (contact details, their message, unread, back)");

// The stat tile is the door now (a number of people is a list); the old
// standalone row gave its spot to the beta-link tile.
await openProfile(page);
{
  const stat = page.locator(".acctstat", { hasText: "Requests" });
  await stat.waitFor();
  if (!(await stat.innerText()).includes("2")) fail("the stat should count them");
  if (await page.locator(".setrow", { hasText: "Nobody has asked about private sessions" }).count())
    fail("the standalone Requests row should be gone");
  // The beta link is the invite card's button now, and a row in the share
  // sheet; the tile it used to be went with the other four.
  await page.locator(".acctinvite .acctinvite-btn").waitFor();
  await stat.click();
  await page.waitForURL(/\/requests/);
}
console.log("requests door ok (the stat opens the list, invite card in the old spot)");

// deleting a coach has to clear every row that points at them — follows they
// made, "going" marks on their classes, notifications, inquiry threads. Miss
// one and Postgres refuses the whole delete on a foreign key.
await page.goto(BASE + "/admin");
await page.getByText("sam@example.com").waitFor();

// Coaches and members are one table, so the panel has to say which is which.
// The count used to be "has a handle", which quietly counted every member as
// a coach from the day members started claiming links.
{
  const stats = await page.locator(".adminstats .adminstat").allInnerTexts();
  const read = (label) => {
    const hit = stats.find((t) => t.toLowerCase().includes(label));
    return hit ? Number(hit.split("\n")[0]) : null;
  };
  const coaches = read("coaches");
  const members = read("members");
  if (members === null) fail("the admin doesn't count members at all");
  if (!(coaches > 0 && members > 0))
    fail(`this run has both, the panel says ${coaches} coaches and ${members} members`);

  const filter = page.locator(".invitefilter").first();
  await filter.getByText(`Coaches (${coaches})`).click();
  await page.waitForTimeout(300);
  const coachBadges = await page.locator(".admincard .adminbadge.kind-member").count();
  if (coachBadges) fail("a member turned up under the Coaches filter");
  await filter.getByText(`Members (${members})`).click();
  await page.waitForTimeout(300);
  const memberBadges = await page.locator(".admincard .adminbadge.kind-coach").count();
  if (memberBadges) fail("a coach turned up under the Members filter");
  await filter.getByText(/^All /).click();
  await page.waitForTimeout(300);
  console.log(`admin tells the two sides apart ok (${coaches} coaches, ${members} members)`);
}

// The studio directory is open to every coach, so the Studios tab keeps the
// receipt: who changed what, when. This run edited Ironbound twice (details,
// then a rename there and back), so the log has rows and the newest names the
// editor.
{
  await page.locator('.adminseg button[aria-label="Studios"]').click();
  await page.getByRole("heading", { name: "Recent edits" }).waitFor();
  const cards = page.locator(".admincard", { hasText: "By Matt" });
  if (!(await cards.count())) fail("the edit log should name Matt as the editor");
  const log = await page.locator(".admincards").last().innerText();
  if (!log.includes("Ironbound")) fail("the edit log should name the studio");
  if (!/name: .*Ironbound Strength & Conditioning/.test(log))
    fail("the rename should be in the log, field and both values");
  if (!log.includes("about added")) fail("the about addition should be in the log");
}
console.log("studio edit log ok (who, what, when on the Studios tab)");

// ---- claiming a studio closes the directory's open door on it
//
// Unclaimed, any coach may correct any entry, which is what kept the directory
// right while nobody owned it. Hand the page to the gym and that stops: the
// details are theirs to state, and everyone else suggests instead.
{
  // The studio cards come before the edit log on this tab, and only they carry
  // the manager controls.
  const studioCard = () =>
    page.locator(".admincards").first().locator(".admincard")
      .filter({ hasText: "Ironbound Strength" }).first();

  const handTo = async (email) => {
    await page.goto(BASE + "/admin");
    await page.locator('.adminseg button[aria-label="Studios"]').click();
    await studioCard()
      .getByRole("button", { name: /Hand this page to the studio|Add another manager/ })
      .click();
    await studioCard().getByPlaceholder("their@email.com").fill(email);
    await studioCard().getByRole("button", { name: "Add", exact: true }).click();
    await page.getByText("They run this page now").waitFor();
  };
  /** Does this page's three-dot menu offer the editor? */
  const hasEditRow = async (p) => {
    await p.goto(BASE + "/s/ironbound-strength");
    await p.locator(".profname", { hasText: "Ironbound Strength" }).waitFor();
    await p.locator(".ownermore").click();
    await p.locator(".ownermenu").waitFor();
    const yes = await p.locator(".ownermenu .setrow", { hasText: "Edit studio" }).count();
    // Suggest is the door that stays open to everyone, claimed or not.
    await p.locator(".ownermenu .setrow", { hasText: "Suggest an edit" }).waitFor();
    await p.locator(".sheetclose").click();
    await p.locator(".ownermenu").waitFor({ state: "detached" });
    return !!yes;
  };

  // Matt runs the gym here. Sam is a coach with no stake in it, and edited this
  // studio's entry freely while it was unclaimed.
  await handTo("matt@example.com");
  await studioCard().getByText("matt@example.com").waitFor();
  console.log("studio claimed ok");

  // Running the place is reached from the You tab, never from the page
  // strangers read: the public studio page carries no manager's control at
  // all, and Your studios opens the shifts screen where the overflow lives.
  // No gym account yet, so the overflow holds the editor and the share and
  // none of the rota rows.
  await page.goto(BASE + "/s/ironbound-strength");
  if (await page.locator(".studioadmin").count())
    fail("the public studio page should carry no manager's door");
  await page.goto(BASE + "/you");
  await page.locator(".acctwrap").waitFor();
  await page.locator(".setrow", { hasText: "Ironbound Strength" }).click();
  await page.waitForURL(/\/shifts/);
  await page.locator(".staffmore").click();
  {
    const rows = (await page.locator(".sheet .setrow .t").allInnerTexts()).map((t) => t.trim());
    if (!rows.includes("Edit studio info"))
      fail("the overflow should hold the editor: " + rows.join("|"));
    if (rows.includes("Shift counter"))
      fail("no gym account means no counts row yet: " + rows.join("|"));
  }
  await page.locator(".sheetclose").first().click();
  await page.waitForFunction(() => !document.querySelector(".sheet"));

  // anonPage signed up as Sam. Claimed by somebody else, his menu loses the
  // pencil and the page says why.
  await anonPage.goto(BASE + "/s/ironbound-strength");
  // Capital V: "Unverified" carries a lowercase v, so this matches only the
  // claimed badge.
  await anonPage.locator(".studiokept", { hasText: /Verified/ }).waitFor();
  if (await hasEditRow(anonPage))
    fail("a claimed studio should not offer the editor to a coach who doesn't run it");
  console.log("claimed studio is closed to other coaches ok (suggest, not edit)");
  if (!(await hasEditRow(page))) fail("the studio's own manager lost the editor");

  // An owner and a manager both hold keys, and neither can shut the other out.
  await handTo("sam@example.com");
  if (!(await hasEditRow(anonPage))) fail("a second manager should get the editor too");
  console.log("two managers on one page ok (owner and manager both hold keys)");

  // Taking the keys back closes it again for that person.
  await page.goto(BASE + "/admin");
  await page.locator('.adminseg button[aria-label="Studios"]').click();
  await studioCard()
    .locator(".adminmgr", { hasText: "sam@example.com" })
    .getByRole("button", { name: "Remove" })
    .click();
  await page.getByText("Keys taken back").waitFor();
  if (await hasEditRow(anonPage)) fail("removing a manager should take the editor back");
  console.log("keys come back ok");

  // Leave Sam holding a key: deleting him below is then also the check that a
  // new users foreign key was wired into adminDeleteUser.
  await handTo("sam@example.com");
  await page.locator('.adminseg button[aria-label="People"]').click();
}

const samCard = page.locator(".admincard").filter({ hasText: "sam@example.com" });
await samCard.getByRole("button", { name: "Delete user" }).click();
await samCard.getByRole("button", { name: "Yes, delete" }).click();
await page.getByText("Deleted Sam").waitFor();
await page.waitForFunction(() => !document.body.innerText.includes("sam@example.com"));
console.log("delete coach ok (follows, going marks, threads all cleared)");

await browser.close();
console.log("ALL SMOKE CHECKS PASSED");
