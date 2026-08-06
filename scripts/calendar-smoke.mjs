// A coach's own calendar: the title and its two views, the banded list, the
// two floating controls, and the sheet a class opens into. This is the screen the whole build is named after
// (build a calendar, share a calendar, follow a calendar), and it had no suite
// at all: every check on it was riding along inside following-smoke's fixture
// setup, which only ever proved a class could be published.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
//   node scripts/calendar-smoke.mjs
import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const fail = (m) => { throw new Error("CAL FAIL: " + m); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const c = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await c.newPage();
p.setDefaultTimeout(20000);

await p.goto(BASE + "/");
await p.getByRole("button", { name: "Sign up with email" }).click();
await p.getByPlaceholder("you@example.com").fill("rae@example.com");
await p.getByPlaceholder("Password").fill("coach-pass-123");
await p.getByRole("button", { name: "Create account" }).click();
await p.getByRole("button", { name: "Not now" }).click().catch(() => {});
await p.getByText("Pick your link.").waitFor();
await p.getByPlaceholder("Your name").fill("Rae Bell");
await p.getByRole("button", { name: "Claim it" }).click();
// Fill the profile rather than skipping it, so the Info tab has two sections
// and a meta line with both halves: the spacing checks below need something
// to measure, and against an empty profile they pass by having nothing to
// look at, which is the quietest way for a check to stop meaning anything.
await p.getByRole("button", { name: "Skip for now" }).click();
await p.locator("#wTitle").fill("Strength & Mobility Coach");
await p.locator("#wAbout").fill("Kettlebells, barbells, and getting people moving well.");
await p.locator("#wLocation").fill("Montclair, NJ");
await p.getByRole("button", { name: "Skip for now" }).click();
await p.waitForURL((u) => !u.pathname.startsWith("/welcome"), { timeout: 20000 });

// An empty calendar carries its own CTA and nothing else. Neither floating
// control is drawn: a plus beside the CTA is one button explaining the other,
// and a poster of an empty week is the app talking to itself.
await p.goto(BASE + "/calendar");
await p.locator(".wkempty-t", { hasText: "Your calendar is empty" }).waitFor();
if (await p.locator(".calbar-add").count()) fail("no plus on an empty calendar");
console.log("an empty calendar is its own CTA, and carries no other control");

// The adder walks in steps now: the studio first, then the studio's class
// list (skipped straight to the form for a brand-new studio), then the form
// with the times.
const add = async (nm, day, t, studio) => {
  await p.goto(BASE + "/calendar");
  await p.locator(".wkempty-cta, .calbar-add").first().click();
  await p.locator(".stepline", { hasText: "Choose the studio" }).waitFor();
  // The list waits for typing: type it, tap it.
  await p.getByLabel("Search studios").fill(studio);
  const existing = p.locator(".studio-row", { hasText: studio });
  if (await existing.count()) {
    await existing.first().click();
    // Step two: this studio's list. The suite's classes are all new.
    await p.getByRole("button", { name: "+ New class" }).click();
  } else {
    await p.getByRole("button", { name: "+ New studio" }).click();
    await p.getByPlaceholder("e.g. Palisade Barbell").fill(studio);
    await p
      .getByPlaceholder("e.g. 501 Palisade Ave, Jersey City")
      .fill("9 Bloomfield Ave, Montclair NJ");
    await p.getByRole("button", { name: "Add studio" }).click();
  }
  await p.getByPlaceholder("e.g. Barbell Strength").fill(nm);
  await p.getByRole("button", { name: day, exact: true }).click();
  await p.locator("#fStart").fill(t);
  await p.locator(".publishwrap .btn").click();
  await p.waitForTimeout(1300);
  const live = p.locator(".sheet", { hasText: "Your class is live" });
  if (await live.count()) {
    await live.locator(".sheetclose").click();
    await p.waitForTimeout(300);
  }
};

// One on every weekday, so whichever day the suite runs on there is something
// in this week and something in the next.
await add("Morning Strength", "Mo", "07:00", "Rae's Room");
await add("Evening Flow", "We", "18:30", "Rae's Room");
await add("Barbell Club", "Fr", "06:30", "Rae's Room");

await p.goto(BASE + "/calendar");
await p.locator(".clline").first().waitFor();

// Add rides the title row beside the view toggle, sized to it. The floating
// Share pill is gone: Share is a tab in the bar now, so nothing floats over
// the calendar at all.
{
  if (await p.locator(".wkfab").count()) fail("the floating plus should be gone from the calendar");
  const addBtn = p.locator(".calbar-add");
  if (!(await addBtn.count())) fail("the plus should ride the title row once there is a week");
  const abox = await addBtn.boundingBox();
  const seg = await p.locator(".calseg").boundingBox();
  if (!(abox.x > seg.x + seg.width - 4)) fail("Add sits right of the toggle");
  if (Math.abs(abox.height - seg.height) > 2)
    fail(`Add matches the toggle's height: ${abox.height} vs ${seg.height}`);
  if (Math.abs(abox.y - seg.y) > 2) fail("Add and the toggle sit on one line");
  if (await p.locator(".wkshare").count()) fail("the floating Share pill should be gone");
  console.log("add beside toggle:", Math.round(abox.x), "| no floating share");
}
await p.screenshot({ path: (process.env.SMOKE_OUT ?? ".") + "/shot-cal-week.png" });

// No ribbon and no coloured bar, anywhere a class is listed. Both belonged to
// the going marks this build removed: the ribbon put a class in your plans and
// the bar said which of four kinds a row was, and there is one kind now.
{
  for (const sel of [".evcard-add", ".ps-accent", '[class*="bookmark"]']) {
    if (await p.locator(sel).count()) fail("the calendar still draws " + sel);
  }
}

// /app is the installed app's start_url and used to render the whole old
// coach shell: two calendars, and the one most people opened was the one with
// the ribbons and the bars still on it.
await p.goto(BASE + "/app");
await p.waitForURL(/\/calendar/);
if (await p.locator(".ps-accent, .evcard-add").count())
  fail("the old shell should be gone, not just hidden");
console.log("/app lands on the calendar, and no row carries a ribbon or a bar");

// The title and the two views. The week stepper is gone: three weeks with an
// arrow either side capped the calendar for no reason the data had, and asked
// somebody to page through a thing they can scroll.
{
  if (await p.locator(".wkarrow").count()) fail("the week stepper should be gone");
  await p.locator(".calbar-t", { hasText: "Calendar" }).waitFor();
  // Two glyphs rather than two words, so the label is the accessible name and
  // the check reads that: a shape says which view it is better than a word
  // does, and a screen reader gets nothing from a shape.
  const seg = await p
    .locator(".calseg button")
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  console.log("views:", seg.join(" | "));
  if (seg.join() !== "List,Month") fail("expected List and Month, got " + seg.join());
  if ((await p.locator(".calseg button").count()) !== 2) fail("two views");
  if (!(await p.locator(".calseg button svg").count()))
    fail("the view switch should be glyphs");
  if ((await p.locator(".calseg button.on").getAttribute("aria-label")) !== "List")
    fail("the list leads");
}

// Every day is banded, and today wears a dot.
{
  const bands = (await p.locator(".dayband").allInnerTexts()).map((t) =>
    t.replace(/\s+/g, " ").trim(),
  );
  console.log("bands:", bands.slice(0, 3).join(" | "));
  if (!bands.length) fail("the list should band its days");
  // The date and nothing else. It counted the day's classes across from the
  // date, which is arithmetic done at somebody who can see the rows directly
  // underneath it.
  if (/class/i.test(bands[0])) fail("a band is the date, not a count: " + bands[0]);
  if (await p.locator(".dayband-dot").count()) fail("the today dot should be gone");
  // Every band reads the same way: the relative words went first, then the
  // dot, so nothing marks today and no band is the odd one out.
  for (const band of bands)
    if (!/^[A-Z][a-z]{2} \u2014 [A-Z][a-z]{2} \d{1,2}/.test(band))
      fail("every band reads the same way, got " + band);
}

// The card slides up over the header: the brandbar pins underneath and the
// content covers it, so a scroll reads as lifting a sheet of paper over the
// chrome. On the calendar the title row pins with the bands (the one
// exception to "only the day bands pin": Month view has no other way back
// to List), and the bands pin under its measured height.
{
  const stick = (sel) => p.locator(sel).first().evaluate((e) => getComputedStyle(e).position);
  if ((await stick(".dayband")) !== "sticky") fail("the day bands should pin");
  if ((await stick(".calsticky")) !== "sticky") fail("the title row should pin on the calendar");
  if ((await stick(".brandbar")) !== "sticky") fail("the header should pin under the card");
  // A pinned band still needs a ground of its own: with nothing behind it the
  // rows scroll through its words, and "no background" is one word away from
  // exactly that bug.
  const bg = await p.locator(".dayband").first().evaluate((e) => getComputedStyle(e).backgroundColor);
  if (/transparent|rgba\(0, 0, 0, 0\)/.test(bg)) fail("a pinned band needs a ground, got " + bg);
  // Scroll a long way: the card is over the header (the pinned title row sits
  // at the very top of the viewport), and a band is pinned right under it.
  await p.evaluate(() => window.scrollTo(0, 600));
  await p.waitForTimeout(400);
  const covered = await p.evaluate(() => {
    const cs = document.querySelector(".calsticky");
    return cs ? cs.getBoundingClientRect().top <= 2 : false;
  });
  if (!covered) fail("the title row should be pinned at the very top, over the header");
  const calH = await p.locator(".calsticky").evaluate((e) => e.offsetHeight);
  const stuck = await p.evaluate((y) => {
    const el = document.elementFromPoint(200, y + 8);
    return el?.closest(".dayband") ? "band" : (el?.className ?? "nothing");
  }, calH);
  if (stuck !== "band") fail("a band should be pinned under the title row, found " + stuck);
  console.log("scrolled: card over the header, a band pinned under the title row");
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(300);
}

// Month is the same rows, looked at differently, and a day in it comes back
// to the list and lands on that day.
{
  await p.locator('.calseg button[aria-label="Month"]').click();
  await p.locator(".monthgrid").first().waitFor();
  if (await p.locator(".clline").count()) fail("Month replaces the list rather than joining it");
  if (!(await p.locator(".monthpill").count())) fail("the grid should carry the classes");
  await p.locator(".monthday:not([disabled])").first().click();
  await p.locator(".clline").first().waitFor();
  if ((await p.locator(".calseg button.on").getAttribute("aria-label")) !== "List")
    fail("tapping a day comes back to the list");
}

// Your own class: date, time and studio, no by-line (this sheet is yours), and
// the three things you can do with it.
await p.locator(".clline").first().click();
await p.locator(".clspeek").waitFor();
await p.waitForTimeout(400);
{
  await p.locator(".clsfull-fact").first().waitFor();
  const factRows = await p.locator(".clsfull-fact .t").allInnerTexts();
  console.log("sheet:", (await p.locator(".clspeek-nm").innerText()).trim(), "|", factRows.join(" / "));
  if (!/[A-Z][a-z]+, [A-Z]/.test(factRows[0] ?? ""))
    fail("the date leads the facts: " + factRows.join());
  if (await p.locator(".clspeek-by").count()) fail("no by-line on your own class");
  // The studio is a door here too.
  const st = await p.locator(".clspeek-door").getAttribute("href");
  if (!/^\/s\//.test(st ?? "")) fail("the studio should open its page, got " + st);
  if (!(await p.locator(".clspeek-btn", { hasText: "Edit" }).count())) fail("expected Edit");
  if (!(await p.locator(".clspeek-btn", { hasText: "Cancel this date" }).count()))
    fail("expected Cancel this date");
  if (!(await p.locator(".clspeek-del").count())) fail("expected the quiet delete");
  // Your own footer is Share alone: there is nothing for you to book.
  if (!(await p.locator(".clsfull-btn.dark").count())) fail("expected the ink Share");
  if (await p.locator(".clsfull-btn.book").count()) fail("no Book on your own class");
}
await p.screenshot({ path: (process.env.SMOKE_OUT ?? ".") + "/shot-cal-sheet.png" });

// Cancelling one date takes that row off and leaves the rest of the class.
const before = await p.locator(".clline").count();
await p.locator(".clspeek-btn", { hasText: "Cancel this date" }).click();
await p.locator(".confirmsheet").waitFor();
await p.locator(".confirmsheet .btn.si").click();
// The sheet closes, then the week catches up on a refresh: wait for the row
// to actually go rather than for a stopwatch.
await p.locator(".clline").nth(before - 1).waitFor({ state: "detached", timeout: 15000 });
{
  const after = await p.locator(".clline").count();
  console.log("cancelled one date:", before, "->", after);
  if (after !== before - 1) fail("one date off, not " + (before - after));
}

// Deleting the whole thing takes every date of it.
await p.locator(".clline").first().click();
await p.locator(".clspeek").waitFor();
await p.waitForTimeout(400);
const name = (await p.locator(".clspeek-nm").innerText()).trim();
await p.locator(".clspeek-del").click();
await p.locator(".confirmsheet").waitFor();
await p.locator(".confirmsheet .btn.si").click();
// Every date of it goes, and the list runs eight weeks, so a standing weekly
// is eight rows: wait for the count to reach nought rather than for one node.
await p.waitForFunction(
  (t) => ![...document.querySelectorAll(".clline-nm")].some((e) => e.textContent === t),
  name,
  { timeout: 15000 },
);
{
  const left = (await p.locator(".clline-nm").allInnerTexts()).map((t) => t.trim());
  console.log("deleted", name, "| left:", [...new Set(left)].join(" | ") || "(nothing)");
  if (left.includes(name)) fail(name + " should be off every week");
}

// A coach's Profile tab opens their page too, with the same gear on it, and
// the page keeps the tab bar so the tab is not a one-way door.
await p.locator(".navtab[data-tab='you']").click();
await p.waitForURL(/\/raebell/);
await p.locator(".profname", { hasText: "Rae Bell" }).waitFor();
if (!(await p.locator(".navtab").count())) fail("your own profile keeps the tab bar");
{
  // No arrow: the tab is how you got here, so there is nothing behind it, and
  // a control offering to undo a tap nobody made is a control in the way.
  if (await p.locator(".profback").count()) fail("your own profile carries no back arrow");
  // No Add class either. The plus lives on the calendar, next to the week it
  // adds to; a second door here meant two screens both claiming to be where
  // classes come from.
  if (await p.locator(".fab").count()) fail("adding a class is the calendar's job");
  // The header's corner is the magnifier now, not your own face: the Profile
  // tab already opens this page, so the face was a second door to it.
  if (await p.locator(".usericon").count()) fail("the header carries no avatar");
  // And the schedule is the calendar's own rows, not a second design for one
  // list. No Teaching/Going segment either: going marks are gone, so the
  // other half can only ever be empty.
  if (await p.locator(".seg", { hasText: "Teaching" }).count())
    fail("the Teaching/Going segment should be gone");
  const names = (await p.locator(".pub .clline-nm").allInnerTexts()).map((t) => t.trim());
  console.log("profile rows:", [...new Set(names)].join(" | "));
  if (!names.length) fail("the profile should draw the calendar's rows");
  if (await p.locator(".pub .ps-event").count()) fail("the old card row should be gone");
}
// The Info tab's spacing. Both of these were long-standing and both were a
// missing rule rather than a wrong number: About overrode the section gap to
// 4px, from when it was bare text rather than a labelled section, so the
// Teaches chips ran straight into its heading; and `.profmeta` had no rule at
// all, so its three spans butted together into "Strength & Mobility
// Coach\u00b7Montclair, NJ".
await p.goto(BASE + "/raebell/about");
{
  const gap = await p
    .locator(".profmeta")
    .evaluate((e) => parseFloat(getComputedStyle(e).columnGap) || 0);
  const line = (await p.locator(".profmeta").innerText()).replace(/\s+/g, " ").trim();
  console.log("meta:", line, "| gap", gap);
  if (gap < 4) fail("the meta line needs room round its middot, got " + gap);

  // Measured off a rendered section rather than counted between two, because
  // this fixture has one: disciplines are a settings field the wizard does not
  // ask for, and a check that only runs on a fuller profile is a check that
  // quietly does not run.
  const top = await p
    .locator(".profsec")
    .first()
    .evaluate((e) => parseFloat(getComputedStyle(e).marginTop) || 0);
  console.log("section margin:", top);
  if (top < 18) fail("sections need room between them, got " + top);
}
await p.goto(BASE + "/raebell");
// The head is chrome: face, name, meta and the pills pin at the header's
// measured height, and the card slides up over the lot. The tabs on the
// card are pills wearing the light-orange wash, with no rule under the row.
{
  const pos = await p.locator(".pubhead").evaluate((e) => getComputedStyle(e).position);
  if (pos !== "sticky") fail("the profile head should pin, got " + pos);
  const barH = await p.locator(".brandbar").evaluate((e) => e.offsetHeight);
  const top = await p.locator(".pubhead").evaluate((e) => parseFloat(getComputedStyle(e).top));
  if (Math.abs(top - barH) > 2) fail(`the head pins at the header's height: ${top} vs ${barH}`);
  const sel = await p.locator(".pubtab.sel").evaluate((e) => getComputedStyle(e).backgroundColor);
  if (/rgba\(0, 0, 0, 0\)|transparent/.test(sel)) fail("the current tab wears the wash, got " + sel);
  const row = await p.locator(".pubtabs").evaluate((e) => {
    const cs = getComputedStyle(e);
    return cs.boxShadow + " | " + cs.borderBottomWidth;
  });
  if (/inset/.test(row)) fail("no rule under the tab row, got " + row);
  // And the tab row pins with the bands under it, the calendar's own pattern:
  // it publishes its height, and the schedule's dates stick right below.
  const spos = await p.locator(".pubstick").evaluate((e) => getComputedStyle(e).position);
  if (spos !== "sticky") fail("the tab row should pin, got " + spos);
  const stickH = await p.locator(".pubstick").evaluate((e) => e.offsetHeight);
  const varTop = await p.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dayband-top")),
  );
  if (Math.abs(varTop - stickH) > 2)
    fail(`the bands should pin under the tab row: ${varTop} vs ${stickH}`);
  console.log("profile head pins at " + top + ", tab row pins at " + stickH + ", tabs are wash pills");
}
// The gear slides settings up over the profile, the same move Edit profile
// makes, and closing lands you back where you were: no navigation at all.
await p.locator('.brandbar-actions [aria-label="Settings"]').click();
await p.locator('.acctwrap[role="dialog"]').waitFor();
await p.locator(".acctstats .acctstat", { hasText: "Followers" }).waitFor();
if (!/\/raebell$/.test(new URL(p.url()).pathname)) fail("the gear should not navigate, at " + p.url());
await p.locator(".acctclose").click();
await p.locator('.acctwrap[role="dialog"]').waitFor({ state: "detached" });
console.log("Profile opens your page, and the gear slides settings up over it");
// The route survives for old links and the OAuth callback.
await p.goto(BASE + "/settings");
await p.locator(".acctstats .acctstat", { hasText: "Followers" }).waitFor();

// The Share tab is a place now: it lands on the hub screen of big tiles,
// with the bar still underneath. Search stays on the header's magnifier.
await p.goto(BASE + "/calendar");
if (await p.locator('.navtab[data-tab="find"]').count())
  fail("the Search tab should be gone from the bar");
if (!(await p.locator(".findbtn:visible").count()))
  fail("the header magnifier should be back on a phone");
await p.locator('.navtab[data-tab="share"]').click();
await p.waitForURL(/\/sharehub/);
if (!(await p.locator(".navtab").count())) fail("the hub keeps the tab bar: it is a tab's screen");
// A coach's hub: Week leads and is selected, the colours redraw the
// preview, and the QR segment carries the code card and the copy link.
await p.locator(".shtitle", { hasText: "Share the week" }).waitFor();
{
  const pills = (await p.locator(".shseg-pill").allInnerTexts()).map((t) => t.trim());
  if (pills.join("|") !== "Week|Profile|QR code")
    fail("a coach's segments are Week, Profile, QR code: " + pills.join("|"));
  if (!(await p.locator(".shseg-pill.on", { hasText: "Week" }).count()))
    fail("Week should lead selected");
  if ((await p.locator(".shswatch").count()) !== 16) fail("sixteen colours");
  const before = await p.locator(".shprev").getAttribute("src");
  await p.locator(".shswatch").nth(3).click();
  const after = await p.locator(".shprev").getAttribute("src");
  if (before === after) fail("a swatch should redraw the preview");
  if (await p.locator(".setrow", { hasText: "Copy your week" }).count())
    fail("copy-week-as-text is gone, by Matt's call");
}
// The QR segment: the named card, the code, and the link beside it.
await p.locator(".shseg-pill", { hasText: "QR code" }).click();
await p.locator(".qrcard .qrimg").waitFor();
if (!(await p.locator(".qrcard-nm").innerText()).trim()) fail("the QR card names its owner");
if (!(await p.locator(".shcta .btn", { hasText: "Copy link" }).count()))
  fail("the copy link lives with the QR code");
// The week segment carries Dates and Classes side by side, and the pickers
// really move the picture: fewer days, and a hidden class comes off the
// count and the compose URL alike.
await p.locator(".shseg-pill", { hasText: "Week" }).click();
{
  if ((await p.locator(".shctrl").count()) !== 2) fail("Dates and Classes sit side by side");
  const a = await p.locator(".shctrl").first().boundingBox();
  const b2 = await p.locator(".shctrl").nth(1).boundingBox();
  if (Math.abs(a.y - b2.y) > 2) fail("the two controls share a row");
  await p.locator(".shctrl", { hasText: "Dates" }).click();
  await p.locator(".shday", { hasText: /^3$/ }).click();
  await p.locator(".shpick .btn", { hasText: "Done" }).click();
  const src1 = await p.locator(".shprev").getAttribute("src");
  if (!/days=3/.test(src1 ?? "")) fail("the range should reach the picture: " + src1);
  await p.locator(".shctrl", { hasText: "Classes" }).click();
  const first = p.locator(".shpick .setrow").first();
  if (await first.count()) {
    await first.click();
    await p.locator(".shpick .btn", { hasText: "Done" }).click();
    const src2 = await p.locator(".shprev").getAttribute("src");
    if (!/hide=/.test(src2 ?? "")) fail("a hidden class should reach the picture: " + src2);
  } else {
    await p.locator(".shpick .btn", { hasText: "Done" }).click();
  }
}
// And the full editor is still one quiet tap away.
await p.locator(".shedit", { hasText: "Open the full editor" }).click();
await p.waitForURL(/\/share$/);
console.log("the Share tab lands on the hub, and the editor is one tap deeper");
await p.goBack();
// The magnifier still opens the directory, from the corner it went back to.
await p.goto(BASE + "/calendar");
await p.locator(".findbtn:visible").click();
await p.locator(".dissheet").waitFor();
await p.locator(".dissheet .sheetclose").click();
await p.locator(".dissheet").waitFor({ state: "detached", timeout: 10000 });
console.log("the header magnifier opens the directory over the calendar");

// The card slides up over the header, and the calendar's title row is the
// one piece of chrome that pins with the bands: without it, Month view has
// no way back to List. The bands pin under it at its measured height.
{
  const pos = await p.locator(".brandbar").evaluate((e) => getComputedStyle(e).position);
  if (pos !== "sticky") fail("the header should pin under the card, got " + pos);
  const spos = await p.locator(".calsticky").evaluate((e) => getComputedStyle(e).position);
  if (spos !== "sticky") fail("the calendar's title row should pin, got " + spos);
  const calH = await p.locator(".calsticky").evaluate((e) => e.offsetHeight);
  const varTop = await p.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dayband-top")),
  );
  console.log("calsticky:", calH, "| --dayband-top:", varTop);
  if (Math.abs(varTop - calH) > 2)
    fail(`the bands should pin under the title row: ${varTop} vs ${calH}`);
  // Land on a deep day and the card is over the header: the pinned title row
  // sits at the very top of the viewport, and the landed day's band sits
  // just under it rather than behind it (the scroll margin has to clear the
  // pinned chrome, or openDay buries the band it landed on).
  // A middle day, not the last: the last block can be too close to the page
  // end to reach the top of the viewport at all.
  const n = await p.locator(".dayblock").count();
  const deep = await p.locator(".dayblock").nth(Math.floor(n / 2)).getAttribute("id");
  await p.evaluate((id) => document.getElementById(id)?.scrollIntoView({ block: "start" }), deep);
  await p.waitForTimeout(200);
  const stick = await p.locator(".calsticky").boundingBox();
  if (stick.y > 2) fail("scrolled, the title row should pin at the very top, got " + stick.y);
  const band = await p.locator(`#${deep} .dayband`).boundingBox();
  console.log("pinned row:", stick.y, "+", stick.height, "| landed band:", band.y);
  if (band.y < stick.y + stick.height - 4)
    fail("the landed band should sit below the pinned title row, got " + band.y);
  // Pinned at the very top the corners square off; kept round, the rows
  // scroll up visibly behind the notches.
  await p.waitForTimeout(300);
  const radPinned = await p
    .locator(".calsticky")
    .evaluate((e) => parseFloat(getComputedStyle(e).borderTopLeftRadius));
  if (radPinned > 1) fail("pinned, the corners should square off, got " + radPinned);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(400);
  const radRest = await p
    .locator(".calsticky")
    .evaluate((e) => parseFloat(getComputedStyle(e).borderTopLeftRadius));
  if (radRest < 20) fail("at rest, the corners come back, got " + radRest);
  console.log("the card slides over the header, and the title row pins with the bands");
}

await b.close();
console.log("ALL CALENDAR CHECKS PASSED");
