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
if (await p.locator(".wkshare").count()) fail("no Share on an empty calendar");
console.log("an empty calendar is its own CTA, and carries no other control");

const add = async (nm, day, t, studio) => {
  await p.goto(BASE + "/calendar");
  await p.locator(".wkempty-cta, .calbar-add").first().click();
  await p.getByPlaceholder("e.g. Barbell Strength").fill(nm);
  await p.getByRole("button", { name: day, exact: true }).click();
  await p.locator("#fStart").fill(t);
  if (studio && (await p.getByRole("button", { name: "Select or start typing a studio" }).count())) {
    await p.getByRole("button", { name: "Select or start typing a studio" }).click();
    const existing = p.locator(".studio-row", { hasText: studio });
    if (await existing.count()) await existing.first().click();
    else {
      await p.getByRole("button", { name: "+ New studio" }).click();
      await p.getByPlaceholder("e.g. Palisade Barbell").fill(studio);
      await p
        .getByPlaceholder("e.g. 501 Palisade Ave, Jersey City")
        .fill("9 Bloomfield Ave, Montclair NJ");
      await p.getByRole("button", { name: "Add studio" }).click();
    }
  }
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

// Add rides the title row beside the view toggle, sized to it; Share floats
// alone at the bottom, glass with the sparkle carrying the colour, wearing
// its word because a sparkle on its own is a decoration.
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
  const share = p.locator(".wkshare");
  if (!(await share.count())) fail("Share should float at the bottom");
  const word = (await share.innerText()).trim();
  const href = await share.getAttribute("href");
  console.log("share pill:", word, "->", href, "| add beside toggle:", Math.round(abox.x));
  if (word !== "Share") fail("the Share pill wears its word: " + word);
  if (href !== "/share") fail("Share opens the composer, got " + href);
  const box = await share.boundingBox();
  // Glass, not a solid slab: it floats over a list somebody is reading, and a
  // solid one there is a hole punched in the page.
  const blur = await share.evaluate(
    (e) => getComputedStyle(e).backdropFilter || getComputedStyle(e).webkitBackdropFilter,
  );
  if (!/blur/.test(blur ?? "")) fail("the Share pill should be glass, got " + blur);
  // No stroke: the pill wears the bar's own glass exactly, so the floating
  // controls and the bar read as one family.
  const bw = await share.evaluate((e) => getComputedStyle(e).borderTopWidth);
  if (parseFloat(bw) > 0) fail("the Share pill's stroke should be gone, got " + bw);
  // And clear air above the bar, not touching it.
  const bar = await p.locator(".navbar").boundingBox();
  if (!(box.y + box.height < bar.y - 8)) fail("Share should clear the bar");
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
  const dots = await p.locator(".dayband-dot").count();
  if (dots > 1) fail("only today wears a dot, got " + dots);
  // Every band reads the same way, and the dot is what marks today: the words
  // used to, which made two bands in a fortnight the odd ones out.
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
  const facts = (await p.locator(".clspeek-facts").innerText()).replace(/\s+/g, " ");
  console.log("sheet:", (await p.locator(".clspeek-nm").innerText()).trim(), "|", facts);
  if (!/^DATE/i.test(facts)) fail("the date leads the facts: " + facts);
  if (!/TIME/i.test(facts) || !/STUDIO/i.test(facts)) fail("expected time and studio: " + facts);
  if (/COACH/i.test(facts)) fail("your own class does not name you: " + facts);
  if (await p.locator(".clspeek-by").count()) fail("no by-line on your own class");
  // The studio is a door here too.
  const st = await p.locator(".clspeek-door").getAttribute("href");
  if (!/^\/s\//.test(st ?? "")) fail("the studio should open its page, got " + st);
  if (!(await p.locator(".clspeek-btn", { hasText: "Edit" }).count())) fail("expected Edit");
  if (!(await p.locator(".clspeek-btn", { hasText: "Cancel class" }).count()))
    fail("expected Cancel class");
  if (!(await p.locator(".clspeek-del").count())) fail("expected the quiet delete");
  if (await p.locator(".clspeek-btn", { hasText: "Full details" }).count())
    fail("your own class has no depth to open: you wrote it");
}
await p.screenshot({ path: (process.env.SMOKE_OUT ?? ".") + "/shot-cal-sheet.png" });

// Cancelling one date takes that row off and leaves the rest of the class.
const before = await p.locator(".clline").count();
await p.locator(".clspeek-btn", { hasText: "Cancel class" }).click();
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
  console.log("profile head pins at " + top + ", tabs are wash pills");
}
await p.locator(".profgear").click();
await p.waitForURL(/\/settings/);
await p.locator(".acctstats .acctstat", { hasText: "Followers" }).waitFor();
console.log("Profile opens your page, and the gear on it opens settings");

// The header's magnifier opens the directory sheet from any tabbed screen,
// the calendar included: one act, one drawing of it, wherever you are
// standing. The dock's separate circle is gone (three tabs and a circle read
// as crammed), so the corner is the door again at every width.
await p.goto(BASE + "/calendar");
if (await p.locator(".navfind").count())
  fail("the dock's search circle should be gone");
await p.locator('.brandbar-actions .iconbtn[aria-label="Find coaches"]').click();
await p.locator(".dissheet").waitFor();
if (!p.url().endsWith("/calendar")) fail("the header's find should not navigate");
await p.locator(".dissheet .sheetclose").click();
await p.locator(".dissheet").waitFor({ state: "detached", timeout: 10000 });
console.log("the header's magnifier opens the directory over the calendar");

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
  await p.evaluate(() => window.scrollTo(0, 0));
  console.log("the card slides over the header, and the title row pins with the bands");
}

await b.close();
console.log("ALL CALENDAR CHECKS PASSED");
