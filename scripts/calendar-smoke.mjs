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
// Fill the profile rather than skipping it, so the About tab has two sections
// and a meta line with both halves: the spacing checks below need something
// to measure, and against an empty profile they pass by having nothing to
// look at, which is the quietest way for a check to stop meaning anything.
await p.locator(".teachcard", { hasText: "Yes, I teach" }).click();
await p.getByRole("button", { name: "Continue", exact: true }).click();
await p.locator("#wTitle").fill("Strength & Mobility Coach");
await p.locator("#wAbout").fill("Kettlebells, barbells, and getting people moving well.");
await p.locator("#wLocation").fill("Montclair, NJ");
await p.getByRole("button", { name: "Continue", exact: true }).click();
await p.getByText("Follow a few coaches").waitFor();
await p.getByRole("button", { name: /find people later/ }).click();
await p.waitForURL((u) => !u.pathname.startsWith("/welcome"), { timeout: 20000 });

// An empty calendar carries its own CTA and nothing else. Neither floating
// control is drawn: a plus beside the CTA is one button explaining the other,
// and a poster of an empty week is the app talking to itself.
await p.goto(BASE + "/calendar");
await p.locator(".wkempty-t", { hasText: "Your calendar is empty" }).waitFor();
if (await p.locator(".wkfab").count()) fail("no floating Add on an empty calendar");
if (await p.locator(".calbar-share").count()) fail("no Share door on an empty calendar");
console.log("an empty calendar is its own CTA, and carries no other control");

// The adder walks in steps now: the studio first, then the studio's class
// list (skipped straight to the form for a brand-new studio), then the form
// with the times.
const add = async (nm, day, t, studio) => {
  await p.goto(BASE + "/calendar");
  await p.locator(".wkempty-cta, .wkfab").first().click();
  // Calendar is coaching-only, so both the empty CTA and the floating plus
  // go straight to the publishing form.
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

// Add floats bottom right (Following's search spot and dress). Calendar is
// coaching-only, so the title row has no relationship filter. No Share door
// lives here either: the Share tab is the way to the hub.
{
  const fab = p.locator(".wkfab");
  if (!(await fab.count())) fail("Add should float bottom right once there is a week");
  const fbox = await fab.boundingBox();
  if (fbox.x < 300 || fbox.y < 500) fail(`the Add FAB sits bottom right, got ${fbox.x},${fbox.y}`);
  if (await p.locator(".calbar-share").count()) fail("the Share arrow is gone from the title row");
  // The title and view controls share one row.
  if (!(await p.locator(".caltitle", { hasText: "Your calendar" }).count()))
    fail("Your calendar sits across from the view controls");
  const titleBox = await p.locator(".caltitle").boundingBox();
  const toggleBox = await p.locator(".calbar .calseg").boundingBox();
  const titleMid = titleBox.y + titleBox.height / 2;
  const toggleMid = toggleBox.y + toggleBox.height / 2;
  if (Math.abs(titleMid - toggleMid) > 3)
    fail(`Calendar and its view toggle should align, got ${titleMid} and ${toggleMid}`);
  if (await p.locator(".calbar-pills").count())
    fail("a coaching-only calendar should not draw All, Coaching, or Added filters");
  console.log("Add floats at", Math.round(fbox.x) + "," + Math.round(fbox.y), "| coaching-only title row");
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
  await p.locator(".calbar").waitFor();
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
  // "Tue, Aug 5": the comma, not the dash, by Matt's call.
  for (const band of bands)
    if (!/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}/.test(band))
      fail("every band reads the same way, got " + band);
}

// Nothing pins at rest any more: the header, the title row and the bands
// all scroll away with the page, and the overlay header fades in once
// you're deep, naming the day under it with the toggle and Add along for
// the ride, on a hint of blurred background.
{
  const stick = (sel) => p.locator(sel).first().evaluate((e) => getComputedStyle(e).position);
  if ((await stick(".dayband")) === "sticky") fail("the bands scroll with the list now");
  if ((await stick(".calsticky")) === "sticky") fail("the title row scrolls away now");
  if ((await stick(".brandbar")) === "sticky") fail("the header scrolls away now");
  if (await p.locator(".scrollhead.on").count()) fail("the overlay header hides at rest");
  // Scroll deep into a day group: the overlay appears and names it.
  await p.evaluate(() => {
    const blocks = document.querySelectorAll(".dayblock");
    const b = blocks[Math.floor(blocks.length / 2)];
    const r = b.getBoundingClientRect();
    window.scrollTo(0, window.scrollY + r.top + r.height / 2 - 200);
  });
  await p.locator(".scrollhead.on").waitFor({ timeout: 5000 });
  const named = (await p.locator(".scrollhead-d").innerText()).trim();
  if (!/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}/.test(named))
    fail("the overlay should name the day under it, got " + named);
  if ((await p.locator(".scrollhead .calseg button").count()) !== 2)
    fail("the overlay carries the view toggle");
  if (await p.locator(".scrollhead .calbar-share").count())
    fail("no Share door on the overlay either");
  const blur = await p
    .locator(".scrollhead")
    .evaluate((e) => getComputedStyle(e).backdropFilter || getComputedStyle(e).webkitBackdropFilter || "");
  if (!/blur/.test(blur)) fail("the overlay hints at what's behind it, got " + blur);
  console.log("overlay header:", named, "| toggle + Add, blurred");
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(400);
  if (await p.locator(".scrollhead.on").count()) fail("back at the top, the overlay should go");
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
  // Scoped to the in-flow toggle: a deep landing can have the overlay's
  // copy mounted too, and the bare selector would match both.
  if ((await p.locator(".calbar .calseg button.on").getAttribute("aria-label")) !== "List")
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
  // Share is back in the footer as the outlined action; the top-left
  // overflow has gone away.
  if (!(await p.locator(".clsfull-btn.share", { hasText: "Share" }).count()))
    fail("expected the outlined Share action in the footer");
  if (await p.locator(".clsfull-more").count()) fail("the overflow menu should be gone");
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

// A coach's Profile tab opens their page too, with the same shared header, and
// the page keeps the tab bar so the tab is not a one-way door.
await p.locator(".navtab[data-tab='you']").click();
await p.waitForURL(/\/raebell/);
await p.locator(".profname", { hasText: "Rae Bell" }).waitFor();
if (!(await p.locator(".navtab").count())) fail("your own profile keeps the tab bar");
{
  // No arrow: the tab is how you got here, so there is nothing behind it.
  // Settings stays in the app header; the profile corner remains empty.
  if (await p.locator('.profback [aria-label*="Back"]').count())
    fail("your own profile carries no back arrow");
  if (await p.locator('.profback [aria-label="Settings"]').count())
    fail("the profile should not duplicate Settings");
  if (!(await p.locator('.brandbar-actions [aria-label="Settings"]').count()))
    fail("the shared header carries Settings");
  // No Add class either. The plus lives on the calendar, next to the week it
  // adds to; a second door here meant two screens both claiming to be where
  // classes come from.
  if (await p.locator(".fab").count()) fail("adding a class is the calendar's job");
  // The header's corner is the magnifier now, not your own face: the Profile
  // tab already opens this page, so the face was a second door to it.
  if (await p.locator(".usericon").count()) fail("the header carries no avatar");
  // And the schedule is the calendar's own rows, not a second design for one
  // list. No Teaching/Going segment either: going marks are gone, so the
  // other half can only ever be empty. About leads the page now, by Matt's
  // call, so the rows live one pill over.
  await p.locator(".pubtab", { hasText: "Schedule" }).click();
  await p.locator(".pub .clline-nm").first().waitFor();
  if (await p.locator(".seg", { hasText: "Teaching" }).count())
    fail("the Teaching/Going segment should be gone");
  const names = (await p.locator(".pub .clline-nm").allInnerTexts()).map((t) => t.trim());
  console.log("profile rows:", [...new Set(names)].join(" | "));
  if (!names.length) fail("the profile should draw the calendar's rows");
  if (await p.locator(".pub .ps-event").count()) fail("the old card row should be gone");
}
// The About tab's spacing. Both of these were long-standing and both were a
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
// The header gear slides settings up over the profile, the same move Edit
// profile makes, and closing lands you back where you were: no navigation.
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

// The Share tab is a place now: it lands on the hub screen with the bar
// still underneath. Search left the bar, by Matt's call: the magnifier in
// the header's corner is the one door.
await p.goto(BASE + "/calendar");
if (await p.locator('.navtab[data-tab="search"]').count())
  fail("Search left the bar: the header magnifier is the door");
await p.locator('.brandbar-actions [aria-label="Search"]').waitFor();
await p.locator('.navtab[data-tab="share"]').click();
await p.waitForURL(/\/coachshare/);
if (!(await p.locator(".navtab").count())) fail("the hub keeps the tab bar: it is a tab's screen");
// A coach's hub: Week leads and is selected, the colours redraw the
// preview, and the QR segment carries the code card and the copy link.
// No title on the hub any more: the segments are the first thing.
await p.locator(".shseg").waitFor();
{
  const pills = (await p.locator(".shseg-pill").allInnerTexts()).map((t) => t.trim());
  if (pills.join("|") !== "Week|Profile|QR code|Text")
    fail("a coach's segments are Week, Profile, QR code, Text: " + pills.join("|"));
  if (!(await p.locator(".shseg-pill.on", { hasText: "Week" }).count()))
    fail("Week should lead selected");
  if ((await p.locator(".shswatch").count()) !== 16) fail("sixteen colours");
  const before = await p.locator(".shprev-week").getAttribute("src");
  await p.locator(".shswatch").nth(3).click();
  const after = await p.locator(".shprev-week").getAttribute("src");
  if (before === after) fail("a swatch should redraw the preview");
  // Copy-as-text came back as the rail's Text chip, by Matt's call: group
  // chats want a pasted week. It is a chip and a sheet now, never the old
  // "Copy your week" settings row.
  if (await p.locator(".setrow", { hasText: "Copy your week" }).count())
    fail("the old copy-week row should not return; Text is a rail chip");
}
// The QR segment: the named card, the code, and the link beside it.
await p.locator(".shseg-pill", { hasText: "QR code" }).click();
await p.locator(".qrcard .qrimg").waitFor();
{
  const qrBox = await p.locator(".qrcard .qrimg").boundingBox();
  if (Math.abs(qrBox.width - qrBox.height) > 2)
    fail(`the QR code must render square, got ${qrBox.width}x${qrBox.height}`);
}
if (!(await p.locator(".qrcard-nm").innerText()).trim()) fail("the QR card names its owner");
if (!(await p.locator(".shcta .btn", { hasText: "Copy link" }).count()))
  fail("the copy link lives with the QR code");
// The Plain text segment: the why, the preview ending on the page link,
// and the copy landing in the toast. It was a rail chip for a day and
// moved up beside Profile and QR code, by Matt's call: a different thing
// to send, not a knob on the picture.
await p.locator(".shseg-pill", { hasText: "Text" }).click();
{
  await p.locator(".shtext").waitFor();
  const txt = (await p.locator(".shtext").innerText()).trim();
  if (!/Full schedule:/.test(txt)) fail("the text ends on the page link");
  await p.locator(".shcta .btn", { hasText: "Copy text" }).click();
  await p.locator(".toast.on", { hasText: "Copied" }).waitFor();
}
// The week segment carries the rail: Dates, Classes, Headline, Layout and Decoration, one
// scrolling row of chips under the colours, and the pickers really move
// the picture: fewer days, and a hidden class comes off the count and the
// compose URL alike.
await p.locator(".shseg-pill", { hasText: "Week" }).click();
{
  // innerText reports the CSS-uppercased label, so compare in lower case.
  const keys = (await p.locator(".shctrl .shctrl-k").allInnerTexts()).map((t) => t.trim().toLowerCase());
  if (keys.join("|") !== "classes|dates|headline|layout|decoration")
    fail("the rail leads with Classes, per the brief: " + keys.join("|"));
  const a = await p.locator(".shctrl").first().boundingBox();
  const b2 = await p.locator(".shctrl").nth(1).boundingBox();
  if (Math.abs(a.y - b2.y) > 2) fail("the chips share a row");
  // The Message chip rewrites the poster's words, and the picture is asked
  // for exactly what was typed.
  await p.locator(".shctrl", { hasText: "Headline" }).click();
  await p.locator("#shMsg").fill("Fall schedule is live");
  await p.locator(".shpick .btn", { hasText: "Done" }).click();
  const srcMsg = await p.locator(".shprev-week").getAttribute("src");
  if (!/Fall%20schedule%20is%20live/.test(srcMsg ?? ""))
    fail("the message should reach the picture: " + srcMsg);
  // Layout is a real structural choice again: six visibly distinct paints,
  // all accepted by the image route, and the chosen id rides the preview URL.
  await p.locator(".shctrl", { hasText: "Layout" }).click();
  const layoutIds = await p.locator(".layoutpick").evaluateAll((els) =>
    els.map((e) => e.getAttribute("data-layout")),
  );
  if (layoutIds.join("|") !== "plain|split|party|neon|brutalist|swiss")
    fail("expected six share layouts, got " + layoutIds.join("|"));
  for (const id of layoutIds) {
    const r = await p.request.get(`${BASE}/api/story/compose?style=${id}&days=3`);
    if (!r.ok()) fail(`${id} layout does not render: ${r.status()}`);
    const buf = await r.body();
    if (buf.readUInt32BE(16) !== 1080 || buf.readUInt32BE(20) !== 1920)
      fail(`${id} layout drew the wrong size`);
  }
  await p.locator('.layoutpick[data-layout="party"]').click();
  const srcLayout = await p.locator(".shprev-week").getAttribute("src");
  if (!/style=party/.test(srcLayout ?? ""))
    fail("the picked layout should reach the picture: " + srcLayout);
  await p.locator(".shctrl", { hasText: "Dates" }).click();
  await p.locator(".shday", { hasText: /^3$/ }).click();
  await p.locator(".shpick .btn", { hasText: "Done" }).click();
  const src1 = await p.locator(".shprev-week").getAttribute("src");
  if (!/days=3/.test(src1 ?? "")) fail("the range should reach the picture: " + src1);
  await p.locator(".shctrl", { hasText: "Classes" }).click();
  const first = p.locator(".shpick .setrow").first();
  if (await first.count()) {
    await first.click();
    await p.locator(".shpick .btn", { hasText: "Done" }).click();
    const src2 = await p.locator(".shprev-week").getAttribute("src");
    if (!/hide=/.test(src2 ?? "")) fail("a hidden class should reach the picture: " + src2);
  } else {
    await p.locator(".shpick .btn", { hasText: "Done" }).click();
  }
}
// No door to the old composer any more: the hub is the whole share screen.
if (await p.locator(".shedit").count()) fail("the editor link should be gone");
if (!(await p.locator(".shcta .btn", { hasText: "Share" }).count() + await p.locator(".shcta a", { hasText: "Save" }).count()))
  fail("the week segment should offer its image");
console.log("the Share tab lands on the hub, and the hub is the whole screen");
// The header magnifier opens the search screen.
await p.goto(BASE + "/calendar");
await p.locator('.brandbar-actions [aria-label="Search"]').click();
await p.waitForURL(/\/search/);
console.log("the header magnifier opens the search screen");
await p.goto(BASE + "/calendar");
await p.locator(".dayblock").first().waitFor();

// A landing from the month grid puts the day's band near the top of the
// viewport, under the overlay header rather than behind it: the scroll
// margin only has to clear the overlay's height now.
{
  // A middle day, not the last: the last block can be too close to the page
  // end to reach the top of the viewport at all.
  const n = await p.locator(".dayblock").count();
  const deep = await p.locator(".dayblock").nth(Math.floor(n / 2)).getAttribute("id");
  await p.evaluate((id) => document.getElementById(id)?.scrollIntoView({ block: "start" }), deep);
  await p.waitForTimeout(300);
  const band = await p.locator(`#${deep} .dayband`).boundingBox();
  console.log("landed band:", Math.round(band.y));
  if (band.y < 40 || band.y > 150)
    fail("the landed band should sit just under the overlay header, got " + band.y);
  // And the overlay names the landed day, because it is the day under it.
  await p.locator(".scrollhead.on").waitFor({ timeout: 5000 });
  const named = (await p.locator(".scrollhead-d").innerText()).trim();
  const bandText = (await p.locator(`#${deep} .dayband-d`).innerText()).trim();
  if (named !== bandText)
    fail(`the overlay should name the landed day: "${named}" vs "${bandText}"`);
  console.log("landed under the overlay, which names " + named);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(400);
}

await b.close();
console.log("ALL CALENDAR CHECKS PASSED");
