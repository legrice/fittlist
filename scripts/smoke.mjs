// Run the server with INVITE_ONLY=false for this suite: it exercises the full
// self-serve signup flow, which the invite-only beta gate would otherwise
// block. The gate itself is covered by scripts/invite-smoke.mjs.
import { chromium } from "playwright";
import { fillLocation, skipSetup } from "./lib/wizard.mjs";
import fs from "fs";

const SCRATCH = process.env.SMOKE_OUT ?? ".";
const BASE = "http://localhost:3000";

const fail = (msg) => { throw new Error("SMOKE FAIL: " + msg); };
const expect = async (cond, msg) => { if (!(await cond)) fail(msg); };
const readLog = () => fs.readFileSync(process.env.SERVER_LOG ?? (SCRATCH + "/server.log"), "utf8");
const cardCount = (pg) => pg.locator(".ps-card").count();
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
// The account page is a full-screen view reached from the header avatar.
const openProfile = async (pg) => {
  await pg.goto(BASE + "/app");
  await pg.locator(".settingsbtn, .usericon").first().click();
  await pg.locator(".acctwrap").waitFor();
};

// Studio-first: pick the studio, then reuse a class from that studio's shared
// catalog via the class-name field.
const addSaved = async (pg) => {
  await pg.getByRole("button", { name: "Add class" }).click();
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

// Flip dark mode from the account view. The toggle sets <html data-mode>
// immediately; the .appshell attribute only lands after the server re-renders,
// so reload for that rather than waiting on router.refresh() (which stalls
// under load and made this the flakiest step in the suite).
const setDark = async (pg, want) => {
  await pg.goto(BASE + "/app");
  await pg.locator(".settingsbtn, .usericon").first().click();
  await pg.locator(".acctwrap").waitFor();
  await pg.waitForTimeout(450); // the account slides up; clicking mid-flight misses
  const row = pg.locator(".setrow", { hasText: "Dark mode" });
  await row.scrollIntoViewIfNeeded();
  if ((await row.getAttribute("aria-pressed")) === String(want)) return;
  await row.click();
  await pg.waitForFunction(
    (w) => (document.documentElement.getAttribute("data-mode") === "dark") === w,
    want,
  );
  await pg.goto(BASE + "/app"); // server truth
  await pg.waitForFunction(
    (w) => !!document.querySelector('.appshell[data-mode="dark"]') === w,
    want,
    { timeout: 20000 },
  );
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
await page.getByRole("heading", { name: "Your week is empty" }).waitFor();
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
await waitSchedule(page, 2);
await page.screenshot({ path: SCRATCH + "/shot-poster-schedule.png" });
console.log("first publish ok");

// ---- steady-state: fab -> pick saved class from the name field -> day -> publish
await addSaved(page);
await page.getByRole("button", { name: "Fr", exact: true }).click();
await page.locator(".publishwrap .btn").click();
await page.getByText("Published", { exact: false }).waitFor();
await waitSchedule(page, 3);
console.log("saved-class flow ok");

// ---- edit in place: tap the Monday class, prefilled with its day, no new class
await page.locator(".ps-daygroup", { hasText: "Monday" }).first().locator(".ps-event").first().click();
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
await page.locator(".ps-daygroup", { hasText: "Friday" }).first().locator(".ps-event").first().click();
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
// class recurring across the calendar, so the count of rendered Fridays drops
// by exactly one while the class itself stays.
{
  const fridayRow = page.locator(".ps-daygroup", { hasText: "Friday" }).first().locator(".ps-event").first();
  const cid = await fridayRow.getAttribute("data-cid");
  const rowsFor = () => page.locator(`.ps-event[data-cid="${cid}"]`).count();
  const before = await rowsFor();
  await page.getByRole("button", { name: "Delete this class" }).click();
  await page.getByRole("button", { name: /^Just / }).click();
  await page.getByText("cancelled", { exact: false }).waitFor();
  await page.waitForFunction(
    ([id, n]) => document.querySelectorAll(`.ps-event[data-cid="${id}"]`).length === n - 1,
    [cid, before],
    { timeout: 10000 },
  );
  // and it's gone from the public page too — one predicate, every surface
  const pub = await (await page.request.get(`${BASE}/matt/schedule`)).text();
  const pubFridays = (pub.match(/Barbell Strength/g) || []).length;
  await page.reload();
  await page.locator(".dashlink", { hasText: "Share week" }).waitFor();
  if ((await rowsFor()) !== before - 1) fail("the cancelled week came back after a reload");
  if (pubFridays === 0) fail("cancelling one week should not empty the public page");
  // the .ics tells subscribed calendars about it rather than silently differing
  const ics = await (await page.request.get(`${BASE}/api/cal/matt`)).text();
  if (!/EXDATE:\d{8}T\d{6}/.test(ics)) fail("a cancelled date needs an EXDATE in the feed");
}
console.log("cancel one occurrence ok (weeks either side survive, EXDATE in the feed)");

// The edit step just before this can recreate rows with fresh ids mid-flight,
// so a delete can occasionally hit a stale row id. Retry the whole flow once.
await page.locator(".ps-daygroup", { hasText: "Friday" }).first().locator(".ps-event").first().click();
await page.getByRole("heading", { name: "Edit class" }).waitFor();
for (let attempt = 0; ; attempt++) {
  await page.getByRole("button", { name: "Delete this class" }).click();
  await page.getByRole("button", { name: "Every Friday" }).click();
  await page.getByText("Deleted", { exact: true }).waitFor();
  let done = false;
  try { await waitSchedule(page, 2, 8000); done = true; } catch {}
  if (!done) {
    await page.reload();
    await page.locator(".dashlink", { hasText: "Share week" }).waitFor();
    done = (await scheduleClasses(page)) === 2;
  }
  if (done) break;
  if (attempt >= 1) fail("delete did not persist after retry");
  await page.locator(".ps-daygroup", { hasText: "Friday" }).first().locator(".ps-event").first().click();
  await page.getByRole("heading", { name: "Edit class" }).waitFor();
}
console.log("delete-in-sheet ok (repeat choice, one day, confirm + cancel)");

// ---- deleting the whole repeating set, on a class made for the purpose
{
  const before = await scheduleClasses(page);
  await page.getByRole("button", { name: "Add class" }).click();
  await page.getByRole("heading", { name: "New class" }).waitFor();
  await page.getByRole("button", { name: "Select or start typing a studio" }).click();
  await page.locator(".studio-row", { hasText: "Ironbound Strength" }).first().click();
  await page.locator("#fName").fill("Temp Repeat");
  await page.getByRole("button", { name: "Tu", exact: true }).click();
  await page.getByRole("button", { name: "Th", exact: true }).click();
  await page.locator(".publishwrap .btn").click();
  await page.getByText("Published", { exact: false }).waitFor();
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
  // an end date two weeks out, on a Tuesday class
  const end = new Date();
  end.setUTCDate(end.getUTCDate() + 14);
  const endIso = end.toISOString().slice(0, 10);
  const past = new Date();
  past.setUTCDate(past.getUTCDate() - 1);

  await page.getByRole("button", { name: "Add class" }).click();
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
  await waitSchedule(page, before + 1, 20000);
  await page.waitForTimeout(700);

  // it shows now, and stops after the end date — the schedule runs a year out
  const rows = await page.locator('.ps-event:has-text("Six Week Block")').count();
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
  await page.getByRole("button", { name: "Add class" }).click();
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

// ---- account page: full-screen view reached from the header settings icon.
// A coach's face is the You tab now, so the corner is settings.
await expect(
  page.locator(".navtab.on .navav-empty").filter({ hasText: "M" }).isVisible(),
  "the You tab carries their face (initial fallback)",
);
await page.locator(".settingsbtn").click();
await page.locator(".acctwrap").waitFor();
await expect(page.getByRole("heading", { name: "Profile" }).isVisible(), "account page opens");
await expect(page.locator(".accttile .acctname", { hasText: "Matt" }).isVisible(), "account tile shows name");
if ((await page.locator(".acctstats .acctstat").count()) !== 3) fail("expected three analytics stats");
if (await page.getByText("Schedule opens").count()) fail("Schedule opens should be gone");
await expect(page.locator(".acctstats .acctstat", { hasText: "Profile views" }).isVisible(), "profile views stat");
await expect(page.locator(".acctstats .acctstat", { hasText: "Followers" }).isVisible(), "followers stat");
await expect(page.locator(".acctcard", { hasText: "Preview profile" }).isVisible(), "preview profile card");
await expect(page.locator(".acctcard", { hasText: "Share your week" }).isVisible(), "share your week card");
await page.screenshot({ path: SCRATCH + "/shot-account.png", fullPage: true });

// ---- tap the avatar -> public profile page with owner back + edit
await page.locator(".acctid").click();
await page.waitForURL("**/matt");
await expect(page.locator(".ownerbar .owneredit").isVisible(), "owner edit button on profile");
await page.locator(".ownerbar .owneredit").click();
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
  .locator(".profav-empty")
  .evaluate((e) => getComputedStyle(e).backgroundColor);
if (shownAvatar !== pickedColor)
  fail(`avatar colour didn't stick: picked ${pickedColor}, page shows ${shownAvatar}`);
console.log("avatar colour pick ok (persists to the public page)");
await page.waitForFunction(() => !document.querySelector(".sheet"));
await page.screenshot({ path: SCRATCH + "/shot-poster-mypage.png", fullPage: true });
// the back arrow returns to the account page (not the schedule)
await page.locator(".ownerback").click();
await page.locator(".acctwrap").waitFor();
await page.locator(".acctclose").click();
await page.waitForFunction(() => !document.querySelector(".acctwrap"));
console.log("account + profile edit ok (back -> account)");

// ---- the top of the schedule is three tools, no title: the tab bar already
// says which space you're in.
await page.goto(BASE + "/app");
{
  const pills = (await page.locator(".dashlinks .dashlink").allInnerTexts()).map((t) => t.trim());
  const want = ["Your profile", "Share week", "QR code", "Copy week"];
  if (pills.join("|") !== want.join("|"))
    fail("schedule tools should be " + want.join(", ") + ", got " + pills.join(", "));
}
if (await page.locator(".calbar-title", { hasText: "Your schedule" }).count())
  fail("the schedule title should be gone");
// Your own week keeps the pin. Only the merged one drops it, where the coach's
// face is already doing the marking.
{
  const where = page.locator(".ps-agenda .ps-estudio").first();
  await where.waitFor();
  if (!(await where.locator(".icon svg").count()))
    fail("your own schedule should still mark the studio with a pin");
}
// each pill goes where it says
await page.locator(".dashlink", { hasText: "QR code" }).click();
await page.locator(".sheet .qrframe").waitFor();
await page.locator(".sheet .sheetclose").click();
await page.waitForFunction(() => !document.querySelector(".sheet"));
await page.locator(".dashlink", { hasText: "Share week" }).click();
await page.locator(".sheet .storyimg").waitFor();
await page.locator(".sheet .sheetclose").click();
await page.waitForFunction(() => !document.querySelector(".sheet"));
await page.locator(".dashlink", { hasText: "Your profile" }).click();
await page.waitForURL("**/matt");
await page.goto(BASE + "/app");
// and the QR is still reachable from the account view
await openProfile(page);
await page.locator(".acctcard", { hasText: "QR code" }).click();
await page.locator(".sheet .qrframe").waitFor();
await page.locator(".sheet .sheetclose").click();
await page.waitForFunction(() => !document.querySelector(".sheet"));
await page.locator(".acctclose").click();
await page.waitForFunction(() => !document.querySelector(".acctwrap"));
console.log("schedule tools ok (three pills, no title)");

// ---- page look: dark mode persists on the account and themes the app AND
// the public page (visitors see it too — it's a server-rendered attribute).
await setDark(page, true);
await page.goto(BASE + "/matt");
await page.waitForFunction(() => document.querySelector('.pub[data-mode="dark"]'));
// dark is the VIEWER's preference: a logged-out visitor to the same page gets
// light, and a signed-in dark viewer gets dark on someone else's page
// bot UA so this check doesn't register as a profile view and skew the stats
const lightCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: "facebookexternalhit/1.1",
});
const lightPage = await lightCtx.newPage();
await lightPage.goto(BASE + "/matt");
await lightPage.locator(".pub").waitFor();
if (await lightPage.locator('.pub[data-mode="dark"]').count())
  fail("a logged-out visitor should see the page in light");
await lightCtx.close();
console.log("dark page look ok (viewer's preference, light when logged out)");
// back to light for the rest of the run
await setDark(page, false);
console.log("light restored ok");

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
await expect(
  page.locator(".coachstudio", { hasText: "Ironbound Strength" }).isVisible(),
  "profile shows 'Where I coach' studio",
);
// The ways to reach them live on their own URL now, not under the bio.
if (await page.locator(".proflink").count())
  fail("contact links belong on /matt/contact, not on About");
await page.goto(BASE + "/matt/contact");
await expect(
  page.locator('.proflink[href="https://instagram.com/mattlifts"]').isVisible(),
  "contact shows instagram link",
);
await expect(
  page.locator('.proflink[href="https://mattlifts.com/"]').isVisible(),
  "contact shows website link",
);
await expect(
  page.locator('.proflink[href="mailto:matt@ironbound.co"]').isVisible(),
  "contact shows email contact button",
);
await expect(
  page.locator('.proflink[href^="tel:"]').isVisible(),
  "contact shows call contact button",
);
await page.goto(BASE + "/matt/about");
if (await page.locator(".profshare").count()) fail("the profile share button should be gone");
if (await page.locator(".profacts .followpill").count())
  fail("the owner has nobody to follow on their own page");
await expect(page.locator(".pubtab", { hasText: "About" }).isVisible(), "About tab present");
await expect(page.locator(".pubtab.sel", { hasText: "About" }).isVisible(), "About tab active on /about");
// Schedule leads: it's the thing the page exists to surface.
{
  const order = await page.locator(".pubtab").allInnerTexts();
  if (order[0].trim() !== "Schedule") fail("Schedule should lead the tabs, got " + order.join(", "));
}

await expect(page.locator(".ownerbar .owneredit").isVisible(), "owner edit button on profile");
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
await page.locator(".accttile .tertiary", { hasText: "Edit profile" }).click();
await page.locator(".editsheet, .sheet").first().waitFor();
await page.getByRole("heading", { name: "Edit profile" }).waitFor();
await page.locator(".sheet .sheetclose, .sheet .adderclose").first().click();
await page.waitForFunction(() => !document.querySelector(".sheet"));
await page.screenshot({ path: SCRATCH + "/shot-profile.png", fullPage: true });

// ---- Schedule is its own URL, so a tab is a real navigation you can share
await page.locator(".pubtab", { hasText: "Schedule" }).click();
await page.waitForFunction(() => document.querySelector('.pub[data-theme="poster"] .ps-event'));
await page.waitForURL((u) => u.pathname === "/matt");
await expect(page.getByText("Barbell Strength").first().isVisible(), "schedule shows class");
await page.screenshot({ path: SCRATCH + "/shot-poster-public.png", fullPage: true });

// ---- a tap opens the class from the bottom, with the schedule still behind it
await page.locator(".ps-event").first().click();
await page.locator(".classsheet").waitFor();
// The sheet opens first and fills a beat later, so wait for the content.
await page.locator(".classsheet-nm", { hasText: "Barbell Strength" }).waitFor();
await expect(page.getByText("143 Newark Ave, Jersey City").isVisible(), "sheet shows address");
await expect(page.locator(".evbtn", { hasText: "Book via Website" }).first().isVisible(), "sheet shows booking link");
await expect(page.locator(".evtype", { hasText: "Strength" }).isVisible(), "sheet shows class type");
await expect(page.getByText("Barbell club for all levels").isVisible(), "sheet shows description");
// The list is still there underneath — that's the point of a sheet.
if (!(await page.locator(".ps-event").count())) fail("the schedule should stay behind the sheet");
await page.screenshot({ path: SCRATCH + "/shot-event-sheet.png" });
await page.locator(".classsheet .sheetclose").click();
await page.waitForFunction(() => !document.querySelector(".classsheet"));
// The page behind the sheet is still a real URL anyone can be sent to.
{
  const href = await page.locator(".ps-event").first().getAttribute("href");
  if (!href || !/\/matt\/[0-9a-f-]{36}/.test(href))
    fail("a class row should still link at its own page: " + href);
  await page.goto(BASE + href);
  await page.getByRole("heading", { name: "Barbell Strength" }).waitFor();
  await page.locator(".evback").click();
  await page.waitForFunction(() => document.querySelector('.pub[data-theme="poster"] .ps-event'));
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
    subPage.locator(".sheet .lead").textContent().then((t) => t.includes("still in beta")),
    "the account offer keeps the beta framing",
  );
  await subPage.getByRole("button", { name: "Maybe later, just email me" }).click();
  await subPage.waitForFunction(() => !document.querySelector(".sheet"));
  await expect(subPage.locator(".followpill").textContent().then((t) => t.trim() === "On the list"), "cta flips to subscribed");

  await subPage.locator(".followpill").click();
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
  await up.locator(".followpill", { hasText: "Following" }).waitFor({ timeout: 20000 });
  await up.goto(BASE + "/feed");
  await up.locator(".feedagenda .ps-event").first().waitFor();
  // leave the fixture as we found it — later assertions count Matt's followers
  await up.goto(BASE + "/matt");
  await up.locator(".followpill", { hasText: "Following" }).click();
  await up.locator(".followpill", { hasText: /^Follow$/ }).waitFor();
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

// ---- that follow dropped a notification; the single Updates bell carries the
// combined badge and opens a Notifications | Messages toggle.
await page.goto(BASE + "/app");
await page.locator(".dashlink", { hasText: "Share week" }).waitFor();
await expect(page.locator('a[href="/updates"] .inboxdot').isVisible(), "updates bell shows a badge");
await page.locator('a[href="/updates"]').click();
await page.getByRole("heading", { name: "Updates" }).waitFor();
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
await page.locator(".updateseg button", { hasText: "Messages" }).click();
await page.getByText("No messages yet", { exact: false }).waitFor();
await page.locator(".updateseg button", { hasText: "Notifications" }).click();
await page.locator(".notifrow").first().waitFor();
// opening the feed clears the badge
await page.goto(BASE + "/app");
await page.locator(".dashlink", { hasText: "Share week" }).waitFor();
if (await page.locator('a[href="/updates"] .inboxdot').count())
  fail("updates badge should clear after opening the feed");
console.log("updates (notifications + messages) ok");

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
await anonPage.getByRole("heading", { name: "Your week is empty" }).waitFor();
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
console.log("second coach has a class ok");

await openProfile(page);
const vis1 = await page.locator(".acctstats .acctstat").nth(0).locator(".n").textContent();
if (vis1.trim() !== "3") fail("profile views should be 3 (2 anon views + 1 fetch), got " + vis1);

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
  // One door up here, and it opens on arrival rather than dropping them on the
  // pitch. Two side by side made the visitor pick before reading anything, and
  // sat right above Message and Follow.
  if (await bar.getByText("Sign up").count())
    fail("the visitor bar carries one door; sign up lives inside the sheet");
  await bar.getByText("Log in").click();
  await lp.waitForURL(/join=login/);
  await lp.getByRole("heading", { name: "Log in" }).waitFor();
  // The other door is under the button, so someone who has never been here
  // isn't stuck with only the close button.
  await lp.locator(".authswitch").getByText("Sign up").click();
  await lp.getByRole("heading", { name: "Sign up with email" }).waitFor();
  // And back the other way.
  await lp.locator(".authswitch").getByText("Log in").click();
  await lp.getByRole("heading", { name: "Log in" }).waitFor();
  await look.close();
  console.log("visitor header ok (one door, the sheet carries the other, credit kept)");
}
await expect(page.locator(".acctstats .acctstat", { hasText: "Profile views" }).isVisible(), "profile views stat labelled");
console.log("visit stats ok");

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
await page.locator(".acctcard", { hasText: "Share your week" }).click();
await page.locator(".sheet h2", { hasText: "Share your week" }).waitFor();
await page.waitForFunction(() => {
  const img = document.querySelector(".storyimg");
  return img && img.complete && img.naturalWidth > 0;
});
await page.locator(".seg").getByText("Today").click();
const imgSrc = await page.locator(".storyimg").getAttribute("src");
if (!imgSrc.includes("span=day")) fail("Today toggle didn't switch span: " + imgSrc);
const dl = await page.locator("a", { hasText: "Save image" }).getAttribute("download");
if (!dl || !dl.endsWith(".png")) fail("save link missing download attr");
await expect(page.locator(".btn.ghost", { hasText: "Share image" }).isVisible(), "share image button present");

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
await page.locator(".acctclose").click();
await page.waitForFunction(() => !document.querySelector(".acctwrap"));
console.log("share sheet ok (save + share + colours + X close)");

// ================= dated classes: one-time option =================
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const nowD = new Date();
const dow0 = (nowD.getUTCDay() + 6) % 7; // 0 = Monday
const monD = new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth(), nowD.getUTCDate() - dow0));
const inWeekD = new Date(monD); inWeekD.setUTCDate(monD.getUTCDate() + 6); // Sun this week (in-week, >= today)
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
await waitSchedule(page, schedBefore + 1);
console.log("one-off in-week ok");

// a next-week one-off - the continuous calendar spans several weeks, so it shows too
await addSaved(page);
await page.getByRole("button", { name: "One-time", exact: true }).click();
await page.locator('input[type="date"]').fill(iso(nextWeekD));
await page.locator(".publishwrap .btn").click();
await page.getByText("Published", { exact: false }).waitFor();
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
await page.locator(".setrow", { hasText: "Login & security" }).click();
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

// back out of the settings sub-view, then log out from the account home
await page.locator(".settingspane .acctclose").click();
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
await page.getByRole("button", { name: "Already have an account? Log in" }).click();
await page.getByRole("heading", { name: "Log in" }).waitFor();
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
await page.locator(".dashlink", { hasText: "Share week" }).waitFor();
if (!(await ctx.cookies()).some((c) => c.name === "fl_session" && c.value))
  fail("magic link should establish a session");
console.log("magic-link login ok");

// log back out, then sign in with the enrolled passkey from the login sheet
await openProfile(page);
await page.getByRole("button", { name: "Log out" }).click();
await page.waitForURL(BASE + "/");
await page.getByRole("button", { name: "Already have an account? Log in" }).click();
await page.getByRole("heading", { name: "Log in" }).waitFor();
await page.getByRole("button", { name: "Use a passkey" }).click();
await page.waitForURL(BASE + "/app");
await page.locator(".dashlink", { hasText: "Share week" }).waitFor();
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
await fan.getByText("Nobody yet").waitFor();

// phase 3: the directory. Empty feed points at it; follow happens inline.
await fan.getByRole("link", { name: "Find coaches" }).click();
await fan.locator(".calbar-title", { hasText: "Discover" }).waitFor();
await fan.locator(".disrow", { hasText: "Matt" }).waitFor();
if (!(await fan.locator(".disrow", { hasText: "class" }).count()))
  fail("directory row missing the classes-this-week line");
// search narrows, and a miss says so
await fan.locator(".dissearch-in").fill("zzzz");
await fan.getByText("No coaches yet").waitFor();
await fan.locator(".dissearch-in").fill("Matt");
await fan.locator(".disrow", { hasText: "Matt" }).waitFor();
await fan.locator(".dissearch-x").click();
// follow inline, then confirm it stuck on the coach's own page
await fan.locator(".disrow", { hasText: "Matt" }).locator(".disfollow").click();
await fan.locator(".disrow", { hasText: "Matt" }).locator(".disfollow.on").waitFor();
await fan.goto(BASE + "/matt");
await fan.locator(".followpill", { hasText: "Following" }).waitFor();
console.log("discover ok (search + inline follow)");
await fan.goto(BASE + "/feed");
// phase 2: merged agenda — avatar strip on top, chronological class rows below
await fan.locator(".feedav", { hasText: "Matt" }).waitFor();
await fan.locator(".feedagenda .ps-event").first().waitFor();
const feedRows = await fan.locator(".feedagenda .ps-event").count();
if (feedRows < 1) fail("feed agenda has no class rows");
// A merged row already carries the coach's face; the studio goes under the
// class name as plain text, with no pin competing with it. The coach's own
// schedule keeps its pin, checked on /app further down.
{
  const where = fan.locator(".feedagenda .ps-ewhere").first();
  await where.waitFor();
  if (await where.locator(".icon svg").count()) fail("the merged week should have no place pin");
  if (!(await where.innerText()).trim()) fail("the merged week lost the studio name");
}
// tap the avatar to filter to that coach, then clear it
await fan.locator(".feedav", { hasText: "Matt" }).click();
await fan.locator(".feedfilterbar", { hasText: "Classes with Matt" }).waitFor();
await fan.locator(".feedagenda .ps-event").first().waitFor();
// the All circle clears the filter
await fan.locator(".feedav", { hasText: "All" }).click();
await fan.locator(".feedfilterbar").waitFor({ state: "detached" });
await fan.locator(".feedav.on", { hasText: "All" }).waitFor();
// tapping a selected coach again also clears it
await fan.locator(".feedav", { hasText: "Matt" }).click();
await fan.locator(".feedfilterbar").waitFor();
await fan.locator(".feedav", { hasText: "Matt" }).click();
await fan.locator(".feedfilterbar").waitFor({ state: "detached" });
// the rail only carries coaches with something in the week — a chip that can
// only ever empty the screen doesn't belong there
{
  const chips = (await fan.locator(".feedav-nm").allInnerTexts())
    .map((t) => t.trim())
    .filter((t) => t !== "All");
  const inWeek = await fan.locator(".feedagenda .ps-ecoach-txt").allInnerTexts();
  for (const nm of chips)
    if (!inWeek.some((c) => c.trim().startsWith(nm)))
      fail(`${nm} is on the rail with no classes in the week`);
}
// each row reads coach, then class, then studio
{
  const order = await fan
    .locator(".feedagenda .ps-event")
    .first()
    .locator(".ps-ebody > *")
    .evaluateAll((els) => els.map((e) => e.className.split(" ")[0]));
  if (order[0] !== "ps-ecoach" || order[1] !== "ps-enm")
    fail("agenda row should read coach, then class name: " + order.join(","));
}
console.log("fan flow ok (signup -> follow -> merged feed + filter)");

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
await fan.goto(BASE + "/discover");
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

// Adding a class + the member's share image — the mirror of the coach's story
await fan.goto(BASE + "/feed");
await fan.locator(".feedagenda .ps-event").first().waitFor();
// marking happens on the class itself now, not on the crowded week row
if (await fan.locator(".feedagenda .goingbtn").count())
  fail("the week should not carry an inline add button");
// The class opens from the bottom, so the week is still behind it and the add
// reads as picking something up rather than going somewhere.
await fan.locator(".feedagenda .ps-event").first().click();
await fan.locator(".classsheet-nm").waitFor();
if (!(await fan.locator(".feedagenda .ps-event").count()))
  fail("the week should stay behind the sheet");
await fan.getByRole("button", { name: "Add to your week", exact: true }).click();
await fan.getByRole("button", { name: "Added to your week" }).waitFor();
// Reopening it says the same thing: the add is on the server, not in the tab.
await fan.locator(".classsheet .sheetclose").click();
await fan.waitForFunction(() => !document.querySelector(".classsheet"));
await fan.reload();
await fan.locator(".feedagenda .ps-event").first().click();
await fan.getByRole("button", { name: "Added to your week" }).waitFor();
// Share is here too, so a class can be passed on without leaving the sheet.
await fan.locator(".classsheet-share").waitFor();
await fan.locator(".classsheet .sheetclose").click();
// and the week reports it back
await fan.goto(BASE + "/feed");
await fan.locator(".feedagenda .ps-event.goingon .ps-goingtag").first().waitFor();
if (await fan.locator(".goingtoggle").count()) fail("the Show going filter should be gone");
// the Going tag sits at the top of the time column, not in the class name
{
  const where = await fan
    .locator(".feedagenda .ps-event.goingon")
    .first()
    .evaluate((e) => e.querySelector(".ps-goingtag")?.parentElement?.className ?? "");
  if (!where.includes("ps-etimecol")) fail("Going tag should live in the time column: " + where);
}

// ---- Your week: the shortlist behind the header icon. Not a calendar — only
// what they added, every row can leave, and the count is what's still ahead.
{
  await fan.goto(BASE + "/feed");
  const dot = fan.locator(".weekbtn .weekdot");
  await dot.waitFor();
  if ((await dot.innerText()).trim() !== "1") fail("the week count should be 1, got " + (await dot.innerText()));
  await fan.locator(".weekbtn").click();
  await fan.waitForURL(/\/week/);
  await fan.getByRole("heading", { name: "Your week" }).waitFor();
  // Reached from the header, but still inside the app: the tabs come with it.
  if (!(await fan.locator(".navbar").count()))
    fail("your week should keep the bottom tabs");
  // Share my week is pinned, so a long week can't push it off the bottom. The
  // page also has to actually scroll: wrapped in .appshell without a .stage it
  // was clipped at the viewport and nothing moved.
  {
    const bar = await fan.locator(".weekcal").evaluate((e) => getComputedStyle(e).position);
    if (bar !== "fixed") fail("Share my week should be pinned, got " + bar);
    const clipped = await fan.evaluate(
      () => getComputedStyle(document.querySelector(".weekcal").closest("div[data-mode], body"))
        .overflow === "hidden",
    );
    if (clipped) fail("your week is inside a clipped shell, so it can never scroll");
  }
  const rows = fan.locator(".weekrow");
  if ((await rows.count()) !== 1) fail("expected one class in the week, got " + (await rows.count()));
  // The row carries what you'd need to decide: what, when, where, whose.
  const txt = await rows.first().innerText();
  for (const bit of ["Barbell Strength", "min", "Matt"])
    if (!txt.includes(bit)) fail(`the week row is missing "${bit}": ${txt}`);
  // A coach shares their week as an image; this is the same move from the
  // other side, and it's the only thing on the screen that isn't a class.
  await fan.locator(".weekcal .setrow", { hasText: "Share my week" }).waitFor();
  // Every row can leave, and it asks first: this is a list of things you meant
  // to do, and the x is one tap away from all of them.
  await rows.first().locator(".weekrow-x").click();
  await fan.locator(".confirmsheet").waitFor();
  await fan.getByRole("button", { name: "Keep it" }).click();
  await fan.waitForFunction(() => !document.querySelector(".confirmsheet"));
  if ((await rows.count()) !== 1) fail("Keep it should leave the class where it was");
  await rows.first().locator(".weekrow-x").click();
  await fan.getByRole("button", { name: "Remove it" }).click();
  await fan.getByText("Removed from your week").waitFor();
  await fan.locator(".empty-block", { hasText: "Nothing added yet" }).waitFor();
  // The badge goes with it: the count is state, not a running total.
  await fan.goto(BASE + "/feed");
  await fan.locator(".weekbtn").waitFor();
  if (await fan.locator(".weekbtn .weekdot").count())
    fail("an empty week should carry no count");
  // Put it back for the checks below.
  await fan.locator(".feedagenda .ps-event").first().click();
  await fan.getByRole("button", { name: "Add to your week", exact: true }).click();
  await fan.getByRole("button", { name: "Added to your week" }).waitFor();
  // The add pill goes green, the same yes Following gives.
  {
    const bg = await fan.locator(".classsheet-add.on").evaluate((e) => getComputedStyle(e).backgroundColor);
    if (bg !== "rgb(61, 139, 83)") fail("Added should be green, got " + bg);
  }
  // Whose class it is, as a face and a name, and not a link out of the sheet.
  await fan.locator(".classsheet-who .classsheet-av").waitFor();
  if (await fan.locator(".classsheet-who a").count())
    fail("the coach line in the sheet shouldn't navigate away");
  if ((await fan.locator(".classsheet-who").innerText()).toLowerCase().startsWith("with"))
    fail("the coach line should just be the name");
  await fan.locator(".classsheet .sheetclose").click();
  await fan.goto(BASE + "/feed");
}
console.log("your week ok (count ahead, rows leave, points at a real calendar)");

// swiping a row right-to-left flips the same mark, without opening the class
{
  const row = fan.locator(".feedagenda .swiperow").nth(1);
  await row.locator(".ps-event").waitFor();
  const wasGoing = await row.locator(".ps-event.goingon").count();
  if (wasGoing) fail("expected the second row to be unmarked before the swipe");
  const box = await row.boundingBox();
  const y = box.y + box.height / 2;
  const from = box.x + box.width - 20;
  await fan.mouse.move(from, y);
  await fan.mouse.down();
  // past the 78px commit point, in steps so the drag is decided as horizontal
  for (const step of [35, 70, 100, 120]) await fan.mouse.move(from - step, y, { steps: 3 });
  await fan.mouse.up();
  await row.locator(".ps-event.goingon .ps-goingtag").waitFor();
  // and it's on the server, not just in the tab
  await fan.reload();
  const marked = await fan.locator(".feedagenda .ps-event.goingon").count();
  if (marked !== 2) fail(`swipe should have marked a second class, got ${marked} marked`);
  // a swipe must not also open the class
  if (!fan.url().endsWith("/feed")) fail("swiping navigated: " + fan.url());
  // swipe the same row again to take it back
  const row2 = fan.locator(".feedagenda .swiperow").nth(1);
  const b2 = await row2.boundingBox();
  const y2 = b2.y + b2.height / 2;
  const from2 = b2.x + b2.width - 20;
  await fan.mouse.move(from2, y2);
  await fan.mouse.down();
  for (const step of [35, 70, 100, 120]) await fan.mouse.move(from2 - step, y2, { steps: 3 });
  await fan.mouse.up();
  await row2.locator(".ps-event.goingon").waitFor({ state: "detached" });
  await fan.reload();
  const after = await fan.locator(".feedagenda .ps-event.goingon").count();
  if (after !== 1) fail(`swiping back should leave 1 marked, got ${after}`);
}
console.log("swipe to mark going ok (right-to-left, both ways, survives reload)");

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
await fan.locator(".navtab", { hasText: "You" }).click();
await fan.waitForURL("**/you");
await fan.locator(".memberid").waitFor();
await fan.locator(".setrow", { hasText: "Share classes you’re attending" }).click();
await fan.getByRole("heading", { name: "Share my week" }).waitFor();
await fan.locator(".storyimg").waitFor();
await fan.locator(".adderclose").click();
// the wordmark is the way back to the week from anywhere
await fan.locator(".brandbar-home").click();
await fan.waitForURL("**/feed");
console.log("going + share my week ok (1080x1920 png, from the account)");

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
await fan.goto(BASE + "/feed");
await fan.locator(".feedagenda .ps-event").first().waitFor(); // still following
const afterOptOut = fanDigestCount();
dcron = await fan.request.get(`${BASE}/api/cron/weekly?key=${CRON_KEY}`);
if (!dcron.ok()) fail("weekly cron failed (post opt-out): " + dcron.status());
await new Promise((r) => setTimeout(r, 600));
if (fanDigestCount() !== afterOptOut) fail("digest opt-out ignored");
console.log("digest opt-out ok (email stops, follows survive)");

// the directory opt-out: off means gone from Find coaches, page still public.
// Checked from the fan's browser — a coach never sees themselves listed.
await openProfile(page);
await page.locator(".setrow", { hasText: "Listed in Find coaches" }).click();
await page.locator(".setrow", { hasText: "only people with your link" }).waitFor();
await fan.goto(BASE + "/discover");
await fan.locator(".calbar-title", { hasText: "Discover" }).waitFor();
if (await fan.locator(".disrow", { hasText: "Matt" }).count())
  fail("opted-out coach still listed in the directory");
const pub = await fan.request.get(`${BASE}/matt`);
if (!pub.ok()) fail("opting out of the directory broke the public page");
await openProfile(page);
await page.locator(".setrow", { hasText: "Listed in Find coaches" }).click();
await page.locator(".setrow", { hasText: "Members can find you" }).waitFor();
await fan.goto(BASE + "/discover");
await fan.locator(".disrow", { hasText: "Matt" }).waitFor();
await fanCtx.close();
console.log("directory opt-out ok (delisted, page still public)");

// a coach following another coach: two separate spaces. Their own schedule
// stays what they teach; following lives on /feed and never leaks publicly.
await page.goto(BASE + "/sam");
await page.locator(".followpill", { hasText: "Follow" }).click();
await page.locator(".followpill", { hasText: "Following" }).waitFor();
await page.goto(BASE + "/feed");
// their own classes belong on their Home too, beside the ones they follow
if (!(await page.locator(".feedagenda .ps-event", { hasText: "Barbell Strength" }).count()))
  fail("a coach's own classes should show on their Home");
await page.locator(".feedav", { hasText: "Matt" }).waitFor();
await page.locator(".feedagenda .ps-event", { hasText: "Conditioning" }).first().click();
await page.getByRole("button", { name: "Add to your week", exact: true }).click();
await page.getByRole("button", { name: "Added to your week" }).waitFor();
// it shows on the following page
await page.goto(BASE + "/feed");
await page.locator(".feedagenda .ps-event.goingon .ps-goingtag").first().waitFor();

// but they can't attend what they teach — swiping their own row says so and
// leaves the row unmarked
{
  const mine = page
    .locator(".feedagenda .swiperow")
    .filter({ hasText: "Barbell Strength" })
    .first();
  await mine.locator(".ps-event").waitFor();
  const box = await mine.boundingBox();
  const y = box.y + box.height / 2;
  const from = box.x + box.width - 20;
  await page.mouse.move(from, y);
  await page.mouse.down();
  for (const s of [35, 70, 100, 120]) await page.mouse.move(from - s, y, { steps: 3 });
  await page.mouse.up();
  await page.locator(".toast.on", { hasText: "You aren’t able to attend your own class" }).waitFor();
  if (await mine.locator(".ps-event.goingon").count())
    fail("a coach's own class was marked Going");
  await page.reload();
  const marked = await page.locator(".feedagenda .ps-event.goingon").count();
  if (marked !== 1) fail(`only the followed class should be marked, got ${marked}`);
}
console.log("own classes on Home ok (visible, not attendable)");

// but the coach's own schedule is only what they teach
await page.goto(BASE + "/app");
await page.locator(".ps-event").first().waitFor();
const ownWeek = await page.locator(".ps-week").innerText();
if (/Conditioning/.test(ownWeek))
  fail("a class the coach attends showed up on their own schedule");
// with the bottom nav to cross between the two spaces
await page.locator(".navtab", { hasText: "Following" }).click();
await page.locator(".feedstrip").waitFor();
await page.locator(".navtab.on", { hasText: "Following" }).waitFor();
await page.locator(".navtab", { hasText: "Discover" }).click();
await page.locator(".calbar-title", { hasText: "Discover" }).waitFor();
await page.locator(".navtab", { hasText: "You" }).click();
await page.locator(".dashlink", { hasText: "Share week" }).waitFor();
// No dead ends. A class opened from a list is a sheet, so closing it is the
// whole way back: you never left.
await page.locator(".navtab", { hasText: "Following" }).click();
await page.locator(".feedagenda .ps-event").first().click();
await page.locator(".classsheet-nm").waitFor();
await page.locator(".classsheet .sheetclose").click();
await page.waitForFunction(() => !document.querySelector(".classsheet"));
await page.locator(".feedstrip").waitFor();
if (!page.url().endsWith("/feed")) fail("opening a class shouldn't navigate: " + page.url());
// The page behind it still exists for a link somebody was sent, and still
// backs into where it came from.
{
  const href = await page.locator(".feedagenda .ps-event").first().getAttribute("href");
  if (href) fail("a feed row opens a sheet, so it shouldn't be a link: " + href);
}
await page.goto(BASE + "/sam/schedule");
{
  const href = await page.locator(".ps-event").first().getAttribute("href");
  await page.goto(BASE + href);
}
await page.locator(".evname").waitFor();
if (!(await page.getByRole("button", { name: /Back to .*schedule/ }).count()))
  fail("a class page opened cold should back into the coach's page");
// a class with no booking link says nothing rather than a line of filler
if (await page.getByText("Just show up").count())
  fail("the no-booking line should be gone");
// a dark viewer sees someone else's page in dark, whatever that coach chose
await setDark(page, true);
await page.goto(BASE + "/sam");
await page.waitForFunction(() => document.querySelector('.pub[data-mode="dark"]'));
await setDark(page, false);
console.log("viewer look wins on another coach's page ok");

// ---- studios have their own page, and any coach can correct one
await page.goto(BASE + "/matt/about");
await page.locator(".coachstudio", { hasText: "Ironbound Strength" }).click();
await page.waitForURL("**/s/ironbound-strength");
await page.locator(".profname", { hasText: "Ironbound Strength" }).waitFor();
await page.getByRole("button", { name: "Edit studio" }).click();
await page.getByRole("heading", { name: "Edit studio" }).waitFor();
await page.locator(".typepick .chip", { hasText: "Strength" }).first().click();
await page.locator(".typepick .chip", { hasText: "HYROX" }).click();
await page.locator("#stAbout").fill("Platforms, a turf strip and a sled track.");
await page.locator("#stEmail").fill("hello@ironbound.example");
await page.locator("#stInsta").fill("@ironboundstrength");
await page.getByRole("button", { name: "Save studio" }).click();
await page.getByText("Studio updated").waitFor();
await page.reload();
{
  const types = await page.locator(".studiotype").allInnerTexts();
  if (types.join("|") !== "Strength|HYROX") fail("studio types didn't stick: " + types.join(","));
}
await page.getByText("Platforms, a turf strip").waitFor();
// the @ comes off the handle, and contact rows render from what was saved
await expect(
  page.locator('.proflink[href="https://instagram.com/ironboundstrength"]').isVisible(),
  "studio instagram link",
);
await expect(page.locator('.proflink[href^="mailto:"]').isVisible(), "studio email link");
// renaming moves the slug, and the old address still resolves by id
{
  const before = page.url();
  await page.getByRole("button", { name: "Edit studio" }).click();
  await page.locator("#stName").fill("Ironbound Strength & Conditioning");
  await page.getByRole("button", { name: "Save studio" }).click();
  await page.waitForURL("**/s/ironbound-strength-conditioning");
  if (page.url() === before) fail("renaming a studio should move its slug");
  await page.getByRole("button", { name: "Edit studio" }).click();
  await page.locator("#stName").fill("Ironbound Strength");
  await page.getByRole("button", { name: "Save studio" }).click();
  await page.waitForURL("**/s/ironbound-strength");
}
// a class points at the studio's page, not straight at a map — in the sheet
// as well as on the page behind it
await page.goto(BASE + "/matt/schedule");
await page.locator(".ps-event").first().click();
await page.locator(".classsheet-nm").waitFor();
await page.locator(".classsheet .evfact", { hasText: "Ironbound Strength" }).click();
await page.waitForURL("**/s/ironbound-strength");
console.log("studio pages ok (edit, types, slug follows the name)");

// a profile reads like a class page: no app header, no bottom tabs, a back
// arrow above the identity block, and the tab pills pin instead of the name
await page.goto(BASE + "/discover");
await page.locator(".disrow-main", { hasText: "Sam" }).click();
await page.locator(".profname").waitFor();
if (!(await page.locator(".profacts .followpill").count()))
  fail("Follow should sit in the actions row under the name");
if (await page.locator(".profshare").count()) fail("the share button should be gone");
// Signed in, this is still the app, so the whole shell comes with it: the
// header above and the tabs below. There's no back arrow any more, because the
// tab bar is the way out and it doesn't depend on how you arrived.
if (!(await page.locator(".profwrap > .brandbar").count()))
  fail("a signed-in viewer should get the app header on a profile");
if (!(await page.locator(".navbar").count()))
  fail("a signed-in viewer should get the tab bar on a profile");
if (await page.locator(".pubhead .evback").count())
  fail("a profile shouldn't carry a back arrow now the tabs are there");
// Nothing pins: each tab is its own page, so there is no long scroll to keep
// a control in reach of.
await expect(
  page.locator(".pubhead").evaluate((e) => getComputedStyle(e).position !== "sticky"),
  "the identity block is not pinned",
);
await expect(
  page.locator(".pubtabs").evaluate((e) => getComputedStyle(e).position !== "sticky"),
  "the tabs are not pinned",
);
// The way off a profile is the tab bar, which is there however you arrived.
await page.locator(".navtab", { hasText: "Discover" }).click();
await page.waitForURL("**/discover");
// the selected tab is a filled pill, not an underline
await page.goto(BASE + "/matt");
await page.locator(".pubtab.sel").waitFor();
{
  const t = await page.locator(".pubtab.sel").evaluate((e) => {
    const cs = getComputedStyle(e);
    return { bg: cs.backgroundColor, radius: parseFloat(cs.borderTopLeftRadius) };
  });
  if (t.radius < 20) fail("the selected tab should be a pill, radius " + t.radius);
  if (t.bg === "rgba(0, 0, 0, 0)") fail("the selected tab should be filled");
}
// ---- each tab is a link with its own URL, so a coach can send someone to one
{
  const hrefs = await page
    .locator(".pubtabs a")
    .evaluateAll((els) => els.map((e) => new URL(e.href).pathname));
  const want = ["/matt", "/matt/about", "/matt/contact"];
  if (hrefs.join("|") !== want.join("|"))
    fail("tabs should link to " + want.join(", ") + ", got " + hrefs.join(", "));
  // Landing on a section URL renders that section and only that section.
  await page.goto(BASE + "/matt/contact");
  await page.locator(".pubtab.sel", { hasText: "Contact" }).waitFor();
  await page.locator('.proflink[href^="mailto:"]').waitFor();
  if (await page.locator(".ps-event").count())
    fail("the contact URL should not carry the schedule");
  if (await page.locator(".profabout").count())
    fail("the contact URL should not carry the bio");
  // And back to the schedule, which is the bare handle.
  await page.locator(".pubtab", { hasText: "Schedule" }).click();
  await page.waitForURL((u) => u.pathname === "/matt");
  await page.locator(".ps-event").first().waitFor();
  // The old /schedule link still resolves: people have already sent it.
  await page.goto(BASE + "/matt/schedule");
  await page.locator(".pubtab.sel", { hasText: "Schedule" }).waitFor();
  await page.locator(".ps-event").first().waitFor();
}
console.log("profile tabs are links ok (three URLs, one section each)");
// following turns the pill green — the same yes as Going. Matt already
// follows Sam by this point, so settle the state first rather than assuming.
await page.goto(BASE + "/discover");
await page.locator(".disrow-main", { hasText: "Sam" }).click();
await page.locator(".followpill").waitFor();
if ((await page.locator(".followpill").innerText()).trim() !== "Following") {
  await page.locator(".followpill").click();
  await page.locator(".followpill", { hasText: /^Following$/ }).waitFor();
}
{
  const bg = await page.locator(".followpill").evaluate((e) => getComputedStyle(e).backgroundColor);
  if (bg !== "rgb(61, 139, 83)") fail("Following should be green, got " + bg);
}
console.log("profile chrome ok (pinned row, no header or tabs, green Following)");

// three tabs only, and the account opens from the header avatar — back in the
// app, since a profile carries neither
await page.goto(BASE + "/app");
await page.locator(".dashlinks").waitFor();
if ((await page.locator(".navtab").count()) !== 3) fail("expected 3 tabs");
await page.locator(".settingsbtn").click();
await page.locator(".acctwrap").waitFor();
await page.locator(".acctclose").click();
// what a coach attends is private: it must not leak onto their public page
const pubHtml = await (await page.request.get(`${BASE}/matt/schedule`)).text();
if (/Sam&#x27;s Conditioning|Sam's Conditioning/.test(pubHtml))
  fail("a class the coach attends leaked onto their public page");
console.log("coach following ok (separate from their schedule, never public)");

// ---- the Followers stat opens the list of who they are, and coaches among
// them can be followed back. Three shapes have to render: a coach (page, so a
// Follow back button), a member (account, no page), and a plain email
// subscriber (no account at all — the one that would blow up on a null user).
{
  const mailCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mailPg = await mailCtx.newPage();
  mailPg.setDefaultTimeout(10000);
  await mailPg.goto(BASE + "/matt");
  await mailPg.locator(".followpill").click();
  await mailPg.locator("#ntEmail").fill("mailonly@example.com");
  await mailPg.getByRole("button", { name: "Add me to the list" }).click();
  await mailPg.locator(".sheet h2", { hasText: "on Matt" }).waitFor();
  await mailCtx.close();
}
await anonPage.goto(BASE + "/matt");
await anonPage.locator(".followpill").waitFor();
if ((await anonPage.locator(".followpill").innerText()).trim() !== "Following") {
  await anonPage.locator(".followpill").click();
  await anonPage.locator(".followpill", { hasText: /^Following$/ }).waitFor();
}
await page.goto(BASE + "/app");
await page.locator(".settingsbtn").click();
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
// back returns to the profile it was opened from
await page.locator(".folback .evback").click();
await page.waitForURL((u) => u.pathname === "/app");
await page.locator(".acctwrap").waitFor();
await page.locator(".acctclose").click();
console.log("followers list ok (email subscriber listed, coach can be followed back)");

// the three stats read as a column: number centred over its label
{
  await page.goto(BASE + "/app");
  await page.locator(".settingsbtn").click();
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
  await page.locator(".acctclose").click();
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
  const lines = await page.locator(".settingslist").first().evaluate((list) =>
    [...list.querySelectorAll(":scope > .setrow")].map((r, i) => ({
      row: r.querySelector(".t")?.textContent ?? "?",
      top: getComputedStyle(r).borderTopWidth,
      first: i === 0,
    })),
  );
  if (lines.length < 4) fail("expected a settings list with several rows");
  for (const l of lines) {
    if (l.first && l.top !== "0px") fail(`the first row shouldn't have a divider: ${l.row}`);
    if (!l.first && l.top === "0px") fail(`${l.row} is missing its divider`);
  }
}
// the member side is still one tab away, and still theirs
await page.locator(".acctclose").click();
await page.waitForFunction(() => !document.querySelector(".acctwrap"));
await page.locator(".navtab", { hasText: "Following" }).click();
await page.locator(".feedstrip, .empty-block").first().waitFor();
await page.locator(".navtab", { hasText: "You" }).click();
await page.locator(".dashlink", { hasText: "Share week" }).waitFor();
console.log("coach settings ok (no duplicate doors, member side still one tab away)");

// the coach's own avatar fills with their palette colour rather than tinting
// the letter on a grey disc
await openProfile(page);
{
  const av = await page.locator(".acctavatar-empty, .acctavatar").first().evaluate((el) => ({
    empty: el.classList.contains("acctavatar-empty"),
    bg: getComputedStyle(el).backgroundColor,
  }));
  if (av.empty && (av.bg === "rgb(234, 227, 210)" || av.bg === "rgba(0, 0, 0, 0)"))
    fail("a photo-less account avatar should carry the coach's colour, got " + av.bg);
}
await page.locator(".acctclose").click();
await page.waitForFunction(() => !document.querySelector(".acctwrap"));
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
  const row = page.locator(".setrow", { hasText: "Availability" });
  await row.scrollIntoViewIfNeeded();
  if (!(await row.innerText()).includes("Not shown"))
    fail("a new coach's availability should start hidden");
  await row.click();
  await page.locator(".availpick").waitFor();
  await page.locator(".availopt", { hasText: "Accepting" }).click();
  await page.locator(".availopt.sel", { hasText: "Accepting" }).waitFor();
  await page.locator(".settingstop .acctclose").click();
}
// And it shows on the page as a badge beside the name, not a pill two lines
// down: it answers the question a visitor is already asking.
{
  await page.goto(BASE + "/matt");
  const badge = page.locator(".profname-row .availbadge");
  await badge.waitFor();
  if (!(await badge.innerText()).includes("Open for clients"))
    fail("the status badge should say the status, got " + (await badge.innerText()));
}
// Back on the account, the row reports it without being opened.
await page.goto(BASE + "/app");
await openProfile(page);
await page.waitForTimeout(450);
{
  const row = page.locator(".setrow", { hasText: "Availability" });
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
await page.locator(".setrow", { hasText: "Contact info" }).click();
await page.locator("#cEmail").waitFor();
await page.locator("#cEmail").fill("matt@coach.example.com");
await page.getByRole("button", { name: "Save contact info" }).click();
await page.getByText("Contact info saved").waitFor();
await page.goto(BASE + "/matt/about");
await page.getByText("NASM CPT").first().waitFor();
// The owner never sees their own Request button, so availability is checked
// where it's stated. That it's still on is what lets the visitor below ask.
await openProfile(page);
await page.waitForTimeout(450);
{
  const row = page.locator(".setrow", { hasText: "Availability" });
  await row.scrollIntoViewIfNeeded();
  if (!(await row.innerText()).includes("Accepting new clients"))
    fail("saving contact info cleared availability: " + (await row.innerText()));
}
await page.locator(".acctclose").click();
console.log("saving contact info leaves the rest alone ok");
{
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const vp = await visitor.newPage();
  vp.setDefaultTimeout(10000);
  // The Contact tab's CTA, on its own URL now.
  await vp.goto(BASE + "/matt/contact");
  await vp.getByRole("button", { name: "Request private session" }).click();
  await vp.locator("#rqName").fill("Priya Visitor");
  await vp.locator("#rqEmail").fill("priya@example.com");
  // The phone is optional and stays optional: a second visitor sends without
  // one below, and the send has to go through either way.
  await vp.locator("#rqPhone").fill("555 867 5309");
  await vp.locator("#rqMsg").fill("Any Saturday mornings free for 1:1?");
  await vp.getByRole("button", { name: "Send message" }).click();
  await vp.getByRole("heading", { name: "Message sent" }).waitFor();

  // The header's Message pill is the main door, and it opens the same composer.
  await vp.goto(BASE + "/matt");
  await vp.locator(".profacts .actpill-primary", { hasText: "Message" }).click();
  await vp.getByRole("heading", { name: "Message Matt" }).waitFor();
  await vp.locator("#rqName").fill("Theo Nophone");
  await vp.locator("#rqEmail").fill("theo@example.com");
  await vp.locator("#rqMsg").fill("Do you take beginners?");
  await vp.getByRole("button", { name: "Send message" }).click();
  await vp.getByRole("heading", { name: "Message sent" }).waitFor();
  await visitor.close();
}
console.log("private session requests sent ok (Contact CTA and the Message pill)");

// ---- Messages is a switch of its own. Availability says whether you're taking
// private clients; this says whether anyone can write to you at all, and a
// coach whose books are full still wants the question about Tuesday's class.
await openProfile(page);
await page.waitForTimeout(450);
{
  const row = page.locator(".setrow", { hasText: "Messages" });
  await row.scrollIntoViewIfNeeded();
  if ((await row.getAttribute("aria-pressed")) !== "true") fail("messages should start on");
  await row.click();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".setrow")]
        .find((r) => r.textContent?.includes("Messages"))
        ?.getAttribute("aria-pressed") === "false",
  );
}
await page.locator(".acctclose").click();
{
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const vp = await visitor.newPage();
  vp.setDefaultTimeout(10000);
  await vp.goto(BASE + "/matt");
  await vp.locator(".profacts").waitFor();
  if (await vp.locator(".actpill-primary", { hasText: "Message" }).count())
    fail("messages off should take the Message pill off the page");
  await vp.goto(BASE + "/matt/contact");
  if (await vp.getByRole("button", { name: "Request private session" }).count())
    fail("messages off should close the Contact door too");
  await vp.goto(BASE + "/matt");
  // Following is unaffected: not writing to someone is not not following them.
  if (!(await vp.locator(".profacts .followpill").count()))
    fail("Follow should survive messages being off");
  await visitor.close();
}
// back on, so the rest of the suite has a door to knock at
await openProfile(page);
await page.waitForTimeout(450);
await page.locator(".setrow", { hasText: "Messages" }).click();
await page.waitForFunction(
  () =>
    [...document.querySelectorAll(".setrow")]
      .find((r) => r.textContent?.includes("Messages"))
      ?.getAttribute("aria-pressed") === "true",
);
await page.locator(".acctclose").click();
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

// The door is in settings, where a coach goes looking for it, and the stat
// beside Followers opens the same list rather than being a dead number.
await openProfile(page);
{
  const row = page.locator(".setrow", { hasText: "Requests" });
  await row.waitFor();
  if (!(await row.innerText()).includes("2 people")) fail("the settings row should count them");
  await page.locator(".acctstat", { hasText: "Requests" }).click();
  await page.waitForURL(/\/requests/);
}
console.log("requests door ok (settings row + the stat opens the list)");

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

const samCard = page.locator(".admincard").filter({ hasText: "sam@example.com" });
await samCard.getByRole("button", { name: "Delete user" }).click();
await samCard.getByRole("button", { name: "Yes, delete" }).click();
await page.getByText("Deleted Sam").waitFor();
await page.waitForFunction(() => !document.body.innerText.includes("sam@example.com"));
console.log("delete coach ok (follows, going marks, threads all cleared)");

await browser.close();
console.log("ALL SMOKE CHECKS PASSED");
