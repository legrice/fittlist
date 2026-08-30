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
await p.locator("#wLocation").fill("Montclair, NJ");
await p.getByRole("button", { name: "Continue", exact: true }).click();
await p.locator("#wPrimary").selectOption("Strength");
await p.locator("#wTitle").fill("Strength & Mobility Coach");
await p.locator("#wAbout").fill("Kettlebells, barbells, and getting people moving well.");
await p.getByRole("button", { name: "Continue", exact: true }).click();
await p.getByText("Follow a few coaches near you").waitFor();
await p.getByRole("button", { name: /find people later/ }).click();
await p.waitForURL((u) => !u.pathname.startsWith("/welcome"), { timeout: 20000 });

// An empty calendar carries its own CTA and nothing else. Neither floating
// control is drawn: a plus beside the CTA is one button explaining the other,
// and a poster of an empty week is the app talking to itself.
await p.goto(BASE + "/calendar");
await p.locator(".wkempty-t", { hasText: "Your schedule is empty" }).waitFor();
if (await p.locator(".wkfab").count()) fail("no floating Add on an empty calendar");
if (await p.locator(".calbar-share").count()) fail("no Share door on an empty calendar");
console.log("an empty calendar is its own CTA, and carries no other control");

// The adder walks in steps now: the studio first, then the studio's class
// list (skipped straight to the form for a brand-new studio), then the form
// with the times.
const add = async (nm, day, t, studio) => {
  await p.goto(BASE + "/calendar");
  await p.locator(".wkempty-cta, .wkfab").first().click();
  // Search the shared catalog first; a coach who is publishing switches into
  // the coaching path, then chooses the required studio.
  await p.getByRole("button", { name: "I’m coaching" }).click();
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

// Add floats bottom right (Following's search spot and dress). The compact
// relationship dropdown shares the title row with the view control. No Share
// door lives here: the Share tab is the way to the hub.
{
  const fab = p.locator(".wkfab");
  if (!(await fab.count())) fail("Add should float bottom right once there is a week");
  const fbox = await fab.boundingBox();
  if (fbox.x < 300 || fbox.y < 500) fail(`the Add FAB sits bottom right, got ${fbox.x},${fbox.y}`);
  if (await p.locator(".calbar-share").count()) fail("the Share arrow is gone from the title row");
  // The title and view controls share one row.
  if (!(await p.locator(".caltitle", { hasText: "Schedule" }).count()))
    fail("Schedule sits across from the filter and view controls");
  const titleBox = await p.locator(".caltitle").boundingBox();
  const toggleBox = await p.locator(".calbar .calseg").boundingBox();
  const titleMid = titleBox.y + titleBox.height / 2;
  const toggleMid = toggleBox.y + toggleBox.height / 2;
  if (Math.abs(titleMid - toggleMid) > 3)
    fail(`Calendar and its view toggle should align, got ${titleMid} and ${toggleMid}`);
  const filter = p.locator(".calfilter select");
  if (!(await filter.count())) fail("the calendar needs its All, Coaching, Added dropdown");
  const options = await filter.locator("option").allTextContents();
  if (options.join("|") !== "All|Coaching|Added") fail("wrong calendar filters: " + options.join("|"));
  if ((await filter.inputValue()) !== "all") fail("the calendar should default to All");
  console.log("Add floats at", Math.round(fbox.x) + "," + Math.round(fbox.y), "| combined calendar title row");
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
  // Share stays in the footer as the outlined action. The top-left overflow
  // keeps secondary class tools, including the owner's edit door.
  if (!(await p.locator(".clsfull-btn.share", { hasText: "Share" }).count()))
    fail("expected the outlined Share action in the footer");
  await p.locator(".clsfull-btn.share", { hasText: "Share" }).click();
  await p.locator(".sheet-full", { hasText: "Share this class" }).waitFor();
  if (!(await p.getByRole("button", { name: "Share image" }).count()))
    fail("class Share should lead with its image");
  if (!(await p.getByRole("button", { name: "Share link" }).count()))
    fail("the image sheet should retain the class link option");
  await p.locator(".sheet-full .sheetclose").click();
  if (!(await p.locator(".clsfull-more").count())) fail("expected the class overflow");
  await p.locator(".clsfull-more").click();
  const tools = await p.locator(".clsfull-menu .ovmenu-item").allInnerTexts();
  for (const wanted of ["Add to Google Calendar", "Add to Apple or Outlook", "Share class", "Edit class"])
    if (!tools.some((tool) => tool.includes(wanted))) fail(`class overflow is missing ${wanted}: ${tools.join(" | ")}`);
  await p.locator(".clsfull-more").click();
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

// Discover and the header magnifier are two shortcuts to the same coach
// search. Share remains its own place in the bar.
await p.goto(BASE + "/calendar");
if (!(await p.locator('.navtab[data-tab="search"]', { hasText: "Discover" }).count()))
  fail("Discover should open coach search from the tab bar");
await p.locator('.brandbar-actions [aria-label="Search"]').waitFor();
await p.locator('.navtab[data-tab="search"]').click();
await p.waitForURL(/\/search/);
await p.locator('input[placeholder="Search coaches"]').waitFor();
if ((await p.locator('.navtab[data-tab="search"][aria-current="page"]').count()) !== 1)
  fail("Discover should stay selected on coach search");
await p.goto(BASE + "/calendar");
await p.locator('.navtab[data-tab="share"]').click();
await p.waitForURL(/\/coachshare/);
if (!(await p.locator(".navtab").count())) fail("the hub keeps the tab bar: it is a tab's screen");
// Share is one focused image studio. Profile cards, QR codes and plain text
// are not hidden tabs or pre-rendered slides behind the schedule poster.
await p.locator('.sheditor-shell[aria-label="Share image editor"]').waitFor();
{
  if (await p.locator('[aria-label="What to share"]').count())
    fail("the image studio should not have a format selector");
  if ((await p.locator(".shsingle-preview .shprev-week").count()) !== 1)
    fail("the image studio should render exactly one schedule poster");
  if (await p.locator(".shprev-sq, .qrcard, .shtext").count())
    fail("profile, QR and text previews should not render in the image studio");
  const initialSrc = await p.locator(".shprev-week").getAttribute("src");
  if (!initialSrc?.startsWith("/api/story/compose?"))
    fail("the single preview should be the schedule image: " + initialSrc);

  const primaryTools = (await p.locator(".sheditor-tools-primary .sheditor-tool-label").allInnerTexts()).map((t) => t.trim());
  if (primaryTools.join("|") !== "Remix|Background|Style")
    fail("the primary image tools should be Remix, Background and Style: " + primaryTools.join("|"));
  const detailTools = (await p.locator(".sheditor-tools-details .sheditor-tool-label").allInnerTexts()).map((t) => t.trim());
  if (detailTools.join("|") !== "Classes|Dates|Headline")
    fail("the coach's schedule tools should be Classes, Dates and Headline: " + detailTools.join("|"));

  // Headline rewrites the poster's words, and the picture is asked for
  // exactly what was typed.
  await p.locator(".sheditor-tool", { hasText: "Headline" }).click();
  await p.locator("#shMsg").fill("Fall schedule is live");
  await p.locator(".shpick .btn", { hasText: "Done" }).click();
  const srcMsg = await p.locator(".shprev-week").getAttribute("src");
  if (!/Fall%20schedule%20is%20live/.test(srcMsg ?? ""))
    fail("the message should reach the picture: " + srcMsg);

  // Style is a real structural choice: six visible coordinated styles,
  // all accepted by the image route, and the chosen id rides the preview URL.
  await p.locator(".sheditor-tool", { hasText: "Style" }).click();
  const layoutIds = await p.locator(".layoutpick").evaluateAll((els) =>
    els.map((e) => e.getAttribute("data-layout")),
  );
  if (layoutIds.join("|") !== "plain|split|party|neon|brutalist|swiss")
    fail("expected six visible share layouts, got " + layoutIds.join("|"));
  for (const id of layoutIds) {
    const r = await p.request.get(`${BASE}/api/story/compose?style=${id}&days=3`);
    if (!r.ok()) fail(`${id} layout does not render: ${r.status()}`);
    const buf = await r.body();
    if (buf.readUInt32BE(16) !== 1080 || buf.readUInt32BE(20) !== 1920)
      fail(`${id} layout drew the wrong size`);
  }
  await p.locator('.layoutpick[data-layout="party"]').click();
  const srcLayout = await p.locator(".shprev-week").getAttribute("src");
  if (!/style=party/.test(srcLayout ?? "") || !/theme=blush/.test(srcLayout ?? "") || !/type=friendly/.test(srcLayout ?? "") || !/hs=90/.test(srcLayout ?? "") || !/deco=double/.test(srcLayout ?? ""))
    fail("the picked style should apply its coordinated defaults: " + srcLayout);
  await p.locator(".sheditor-tool", { hasText: "Dates" }).click();
  await p.locator(".shday", { hasText: /^3$/ }).click();
  await p.locator(".shpick .btn", { hasText: "Done" }).click();
  const src1 = await p.locator(".shprev-week").getAttribute("src");
  if (!/days=3/.test(src1 ?? "")) fail("the range should reach the picture: " + src1);
  await p.locator(".sheditor-tool", { hasText: "Classes" }).click();
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
if ((await p.locator(".share-tab-header").getByRole("button", { name: "Share image" }).count()) !== 1)
  fail("the image studio should put Share in the top-right header");
if (await p.locator(".sheditor-dock").getByRole("button", { name: "Share image" }).count())
  fail("the image studio should not duplicate Share at the bottom");
console.log("the Share tab is one focused schedule image studio");
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
