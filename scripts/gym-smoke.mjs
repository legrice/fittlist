// The gym's rota: the thing that replaces the spreadsheet.
//
// A gym runs its own schedule here. Its classes belong to the gym rather than
// to whoever is teaching them, which is what lets a coach take shifts without
// wanting a public profile and lets a gym publish a week without naming
// anybody. This walks the whole path: claim the page, turn on the schedule,
// build a week, put somebody on a slot, and check they hear about it and that
// nobody who doesn't run the place can see any of it.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true ADMIN_EMAILS=matt@example.com \
//     npm run start > server.log 2>&1 &
//   node scripts/gym-smoke.mjs
import { chromium } from "playwright";
import { fillLocation, skipSetup } from "./lib/wizard.mjs";
const BASE = "http://localhost:3000";
const fail = (m) => { throw new Error("GYM FAIL: " + m); };

// The app's day is US Eastern, so a date computed off the server's UTC clock
// can be tomorrow's. Anything asserting on a specific date has to agree.
const weekDay = (i) => {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + i);
  return d.toISOString().slice(0, 10);
};
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

// A coach's settings leaves all sit behind one of four group rows now, so
// reaching one is two taps: the group on the account, then the row inside the
// sheet it opens. A sheet left up by a previous step holds a .settingslist of
// its own, so it has to be closed first or the group row is the wrong list's.
const openSetting = async (pg, group) => {
  await pg.locator(".acctwrap").waitFor();
  await pg.waitForTimeout(450); // a navigation, so the rows need a beat
  for (let i = 0; i < 3; i++) {
    if (!(await pg.locator(".sheet").count())) break;
    await pg.locator(".sheet .sheetclose, .sheet .sheetback").first().click().catch(() => {});
    await pg.waitForTimeout(350);
  }
  await pg.locator(".settingslist .setrow", { hasText: group }).first().click();
  await pg.waitForTimeout(450);
};

const mkCoach = async (email, name, withClass) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(15000);
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
  if (withClass) {
    await p.getByRole("heading", { name: "Your week is wide open" }).waitFor();
    await p.getByRole("button", { name: "Add your first class" }).click();
    await p.getByPlaceholder("e.g. Barbell Strength").fill("Warm Up");
    await p.getByRole("button", { name: "Mo", exact: true }).click();
    await p.getByRole("button", { name: "Select or start typing a studio" }).click();
    await p.getByRole("heading", { name: "Choose a studio" }).waitFor();
    const existing = p.locator(".studio-row", { hasText: "Ironbound" }).first();
    if (await existing.count()) await existing.click();
    else {
      await p.getByRole("button", { name: "+ New studio" }).click();
      await p.getByPlaceholder("e.g. Palisade Barbell").fill("Ironbound Performance");
      await p.getByPlaceholder("e.g. 501 Palisade Ave, Jersey City").fill("9 Elm St, Newark NJ");
      await p.getByRole("button", { name: "Add studio" }).click();
    }
    await p.locator(".studio-sel .nm").waitFor();
    await p.locator(".publishwrap .btn").click();
    await p.waitForTimeout(700);
  }
  return p;
};

const matt = await mkCoach("matt@example.com", "Matt", true);
const julia = await mkCoach("julia@example.com", "Julia", true);
const tom = await mkCoach("tom@example.com", "Tom", true);
console.log("three coaches at Ironbound ok");

// admin: hand the page to Matt and Julia, then turn its schedule on
await matt.goto(BASE + "/admin");
await matt.locator('.adminseg button[aria-label="Studios"]').click();
const card = () => matt.locator(".admincards").first().locator(".admincard").filter({ hasText: "Ironbound" }).first();
for (const em of ["matt@example.com", "julia@example.com"]) {
  await card().getByRole("button", { name: /Hand this page to the studio|Add another manager/ }).click();
  await card().getByPlaceholder("their@email.com").fill(em);
  await card().getByRole("button", { name: "Add", exact: true }).click();
  await matt.getByText("They run this page now").waitFor();
  await matt.waitForTimeout(400);
}
await card().getByRole("button", { name: "Turn on its schedule" }).click();
await matt.getByText("Its schedule is on").waitFor();
console.log("gym account on ok");

// The studio picker autocompletes names, so read the slug rather than guess it.
await matt.goto(BASE + "/matt/studios");
const studioHref = await matt.locator('a[href^="/s/"]').first().getAttribute("href");
if (!studioHref) fail("no studio on the coach's page");
console.log("studio at " + studioHref);

// the rota, from the studio page
await matt.goto(BASE + studioHref);
// The manager's tools live behind the floating Studio admin pill now, and
// with the account on it holds the rota, the counts, and the page views.
await matt.locator(".studioadmin").click();
{
  const rows = (await matt.locator(".sheet .setrow .t").allInnerTexts()).map((t) => t.trim());
  for (const want of ["The rota", "Shifts worked", "Edit studio info"])
    if (!rows.includes(want)) fail("the admin sheet is missing " + want + ": " + rows.join("|"));
}
await matt.locator(".sheet .stat .n").waitFor();
// Anchored: the counts row's sub-line says "the rota" too.
await matt.locator(".sheet .setrow", { hasText: /^The rota/ }).click();
await matt.waitForURL("**/manage");
await matt.locator(".admintop h1").waitFor();

// add a class with nobody on it. The form is the coach's own adder, handed the
// gym's studio and one extra field, so the ids are the adder's.
await matt.locator(".rotaday", { hasText: "Thursday" }).getByRole("button", { name: "Add" }).click();
await matt.locator("#fName").waitFor();
if (await matt.locator("#fCoach").count() === 0) fail("a gym's adder needs the rota field");
if (await matt.locator(".studio-sel").count()) fail("a gym should never be asked for a studio");
if (await matt.getByText("Who sees this?").count()) fail("a gym has no private classes");
await matt.locator("#fName").fill("HYROX");
await matt.locator("#fStart").fill("07:00");
await matt.getByRole("button", { name: "Add to the schedule" }).click();
await matt.getByText("Added to the week").waitFor();
await matt.waitForTimeout(600);
const openRow = matt.locator(".ps-event.ps-event-open", { hasText: "HYROX" });
await openRow.waitFor();
if (!(await openRow.innerText()).includes("Nobody on it yet"))
  fail("an unassigned slot should say so");
console.log("open slot ok (added, nobody on it)");

// now put Tom on it
await openRow.click();
await matt.locator("#fCoach").waitFor();
await matt.locator("#fCoach").selectOption({ label: "Tom" });
await matt.getByRole("button", { name: "Save changes" }).click();
await matt.getByText("Saved").waitFor();
await matt.waitForTimeout(600);
const filled = matt.locator(".ps-event", { hasText: "HYROX" });
if (!(await filled.innerText()).includes("Tom")) fail("the row should name the coach");
if (await matt.locator(".ps-event.ps-event-open", { hasText: "HYROX" }).count())
  fail("an assigned slot should stop reading as open");
console.log("assignment ok (Tom is on it)");

// Tom hears about it
await tom.goto(BASE + "/updates");
await tom.locator(".notifrow", { hasText: "You're coaching HYROX" }).waitFor();
const body = await tom.locator(".notifrow", { hasText: "HYROX" }).innerText();
if (!/THU|Thu/i.test(body) || !body.includes("7:00a")) fail("the notice should say when: " + body);
if (!(await tom.locator(".notifrow .icon svg").first().count()))
  fail("the shift notice rendered a blank circle");
console.log("the coach is told ok");

// ---- a gym class carries what a coach's does, and can borrow it
//
// The coaches here already described "Warm Up" when they added it. Building
// the rota shouldn't mean typing it out again, and the description shouldn't
// end up different depending on who wrote it down.
{
  await matt.goto(BASE + studioHref + "/manage");
  await matt.locator(".rotaday", { hasText: "Tuesday" }).getByRole("button", { name: "Add" }).click();
  // The same autocomplete a coach gets on the class-name field, over the same
  // studio catalogue. No second way of doing it.
  await matt.locator("#fName").click();
  await matt.locator(".namesug button").first().waitFor();
  const options = await matt.locator(".namesug button").allInnerTexts();
  if (!options.some((o) => /Warm Up/.test(o)))
    fail("a class already described here should be pullable: " + options.join(","));
  await matt.locator(".namesug button", { hasText: "Warm Up" }).first().click();
  await matt.waitForTimeout(300);
  if ((await matt.locator("#fName").inputValue()) !== "Warm Up")
    fail("pulling one in should fill the name");

  // Everything a coach's class carries, on a gym's too.
  await matt.locator("#fType").selectOption({ label: "Strength" });
  await matt.locator("#fDesc").fill("Bring shoes you can lift in.");
  await matt.getByRole("button", { name: "+ Add link" }).click();
  const linkBox = matt.locator('input[aria-label="Link"]').last();
  await linkBox.fill("https://ironbound.example/book");
  await matt.locator(".linktag").first().waitFor();
  await matt.locator("#fStart").fill("12:00");
  await matt.locator("#fCoach").selectOption({ label: "Julia" });
  await matt.getByRole("button", { name: "Add to the schedule" }).click();
  await matt.getByText("Added to the week").waitFor();
  await matt.waitForTimeout(700);
  console.log("pulled a class in and filled the rest ok");

  // Reopening it shows what was saved rather than an empty form.
  await matt.locator(".ps-event", { hasText: "Warm Up" }).first().click();
  await matt.locator("#fDesc").waitFor();
  if (!(await matt.locator("#fDesc").inputValue()).includes("shoes you can lift"))
    fail("the description didn't survive a save");
  const urls = await matt
    .locator('input[aria-label="Link"]')
    .evaluateAll((els) => els.map((e) => e.value));
  if (!urls.includes("https://ironbound.example/book"))
    fail("the booking link didn't survive a save: " + urls.join(","));
  await matt.locator(".sheetclose").click();
  console.log("the details come back on an edit ok");
}

// And they reach the class a member actually opens.
{
  const anonCtx = await b.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (gym detail bot)",
  });
  const anon = await anonCtx.newPage();
  anon.setDefaultTimeout(15000);
  await anon.goto(BASE + studioHref);
  await anon.locator(".ps-event", { hasText: "Warm Up" }).first().click();
  await anon.locator(".classoverlay-nm", { hasText: "Warm Up" }).waitFor();
  const body = await anon.locator(".classoverlay-body").innerText();
  if (!body.includes("shoes you can lift")) fail("the description never reached the class");
  await anon.getByRole("button", { name: "Book" }).waitFor();
  await anonCtx.close();
  console.log("the description and the booking door reach the class ok");
}

// ---- a swap: one date changes hands, the standing rota doesn't
//
// This is the thing the spreadsheet does with a dropdown, and the thing that
// has to reach two calendars or somebody doesn't turn up.
{
  await matt.goto(BASE + studioHref + "/manage");
  const row = matt.locator(".ps-event", { hasText: "HYROX" }).first();
  await row.waitFor();
  await row.click();
  await matt.locator("#rotaOn").waitFor();
  // Tom is on it normally; Julia takes this one date.
  const label = await matt.locator("#rotaOn option:checked").innerText();
  if (!/Tom/.test(label)) fail("this date should start on the regular coach, got " + label);
  await matt.locator("#rotaOn").selectOption({ label: "Julia" });
  await matt.getByText("Swapped").waitFor();
  await matt.waitForTimeout(700);
  await matt.locator(".sheetclose").click();
  const swapped = matt.locator(".ps-event", { hasText: "HYROX" }).first();
  const txt = await swapped.innerText();
  if (!txt.includes("Julia")) fail("the row should show who's actually on: " + txt);
  if (!/covering/i.test(txt)) fail("a swapped date should be marked as an exception");
  console.log("swap ok (Julia has this one, Tom keeps the rest)");

  // Next week is untouched: a swap is one date, not a change to the class.
  await matt.goto(BASE + studioHref + "/manage?w=1");
  const next = matt.locator(".ps-event", { hasText: "HYROX" }).first();
  await next.waitFor();
  const nextTxt = await next.innerText();
  if (!nextTxt.includes("Tom")) fail("next week should still be the regular coach: " + nextTxt);
  if (/covering/i.test(nextTxt)) fail("next week should carry no exception");
  console.log("the standing rota is untouched ok");
}

// Both calendars move: the date leaves Tom's and lands in Julia's. Getting
// this wrong is two people turning up, or nobody.
{
  const feedFor = async (page) => {
    await page.goto(BASE + "/app?acct=1");
    await openSetting(page, "Calendar & sync");
    const r = page.locator(".sheet .setrow", { hasText: "Your week in your calendar" });
    await r.waitFor();
    await r.click();
    const href = await page.locator('.installhow a[href^="webcal:"]').getAttribute("href");
    const res = await page.request.get(href.replace(/^webcal:/, "http:"));
    if (!res.ok()) fail("calendar feed is " + res.status());
    return res.text();
  };
  const tomIcs = await feedFor(tom);
  if (!tomIcs.includes("HYROX")) fail("Tom should still have his standing HYROX");
  if (!/EXDATE:/.test(tomIcs)) fail("the covered date should drop out of Tom's recurrence");
  const juliaIcs = await feedFor(julia);
  if (!juliaIcs.includes("HYROX")) fail("Julia's cover never reached her calendar");
  if (!/covering this one/i.test(juliaIcs)) fail("the cover entry should say what it is");
  console.log("the date moves between both calendars ok");
}

// Opening a slot up: nobody on it, said out loud rather than left blank.
{
  await matt.goto(BASE + studioHref + "/manage");
  await matt.locator(".ps-event", { hasText: "HYROX" }).first().click();
  await matt.locator("#rotaOn").waitFor();
  await matt.locator("#rotaOn").selectOption("");
  await matt.getByText("Opened up").waitFor();
  await matt.waitForTimeout(700);
  await matt.locator(".sheetclose").click();
  const opened = matt.locator(".ps-event.ps-event-open", { hasText: "HYROX" }).first();
  await opened.waitFor();
  if (!(await opened.innerText()).includes("Nobody on it yet"))
    fail("an opened date should say nobody is on it");
  console.log("opening a date up ok");

  // And back to the regular coach clears the exception entirely.
  await opened.click();
  await matt.locator("#rotaOn").selectOption({ label: "Tom (usually)" });
  await matt.getByText("Swapped").waitFor();
  await matt.waitForTimeout(700);
  await matt.locator(".sheetclose").click();
  const back = matt.locator(".ps-event", { hasText: "HYROX" }).first();
  if (/covering/i.test(await back.innerText()))
    fail("putting the regular coach back should clear the exception, not store one");
  console.log("back to normal clears the exception ok");
}

// ---- what it adds up to, and the history that has to survive
//
// A count read off the current rota would say Tom taught every week since the
// class existed, including the weeks Julia covered and the weeks before he was
// on it at all. That's somebody's paycheck, so the past gets frozen.
{
  await matt.goto(BASE + studioHref + "/manage");
  await matt.getByRole("link", { name: "Shifts worked" }).click();
  await matt.waitForURL("**/counts");
  await matt.getByRole("heading", { name: "Shifts worked" }).waitFor();
  // A class added today may have no occurrences left in this month, so count
  // the month where its weekly slot actually falls.
  const nextMonth = (() => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  })();
  await matt.goto(BASE + studioHref + `/manage/counts?m=${nextMonth}`);
  await matt.locator(".counttable").waitFor();
  const before = await matt.locator(".counttable").innerText();
  if (!/Tom/.test(before)) fail("the regular coach should be counted: " + before);
  if (/\d+th\b/.test(before) && /(?:21|22|23|31)th/.test(before))
    fail("the half-month label got its ordinal wrong: " + before);
  // The two halves and a total, the shape the spreadsheet has.
  if (!/1st to 15th/i.test(before) || !/Total/i.test(before))
    fail("the table should split the month in half: " + before);
  console.log("counts ok (counted off the schedule)");

  // Copy the table out: the number goes to whatever actually pays people.
  await matt.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await matt.getByRole("button", { name: "Copy the table" }).click();
  await matt.getByText("Copied, ready to paste").waitFor();
  const pasted = await matt.evaluate(() => navigator.clipboard.readText());
  if (!pasted.includes("Tom") || !/Coach\t/.test(pasted))
    fail("the copied table should be pasteable columns: " + pasted);
  console.log("the table copies out ok");
}

// Handing the standing slot to somebody else must not rewrite what already
// happened. The dates somebody covered stay theirs, whoever holds the slot now.
//
// (The other half of this, freezing plain past weeks on handover, only has a
// window once a class is more than a day old, so a same-day run can't reach
// it. What is reachable is that an explicit cover survives, which is the same
// property from the side the suite can see.)
{
  await matt.goto(BASE + studioHref + "/manage");
  const row = matt.locator(".ps-event", { hasText: "HYROX" }).first();
  await row.click();
  await matt.locator("#rotaOn").waitFor();
  await matt.locator("#rotaOn").selectOption({ label: "Julia" });
  await matt.getByText("Swapped").waitFor();
  await matt.waitForTimeout(700);
  await matt.locator(".sheetclose").click();

  // Now hand the standing slot to Matt entirely.
  await matt.locator(".ps-event", { hasText: "HYROX" }).first().click();
  await matt.locator("#fCoach").waitFor();
  await matt.locator("#fCoach").selectOption({ label: "Matt" });
  await matt.getByRole("button", { name: "Save changes" }).click();
  await matt.getByText("Saved").waitFor();
  await matt.waitForTimeout(800);
  await matt.locator(".sheetclose").click().catch(() => {});

  const covered = matt.locator(".ps-event", { hasText: "HYROX" }).first();
  const txt = await covered.innerText();
  if (!txt.includes("Julia"))
    fail("handing the slot over took a covered date with it: " + txt);
  console.log("a covered date survives a handover ok");

  // Put it back so the rest of the run sees the rota it expects.
  await covered.click();
  await matt.locator("#fCoach").waitFor();
  await matt.locator("#fCoach").selectOption({ label: "Tom" });
  await matt.getByRole("button", { name: "Save changes" }).click();
  await matt.getByText("Saved").waitFor();
  await matt.waitForTimeout(600);
  await matt.locator(".sheetclose").click().catch(() => {});
  await matt.locator(".ps-event", { hasText: "HYROX" }).first().click();
  await matt.locator("#rotaOn").waitFor();
  await matt.locator("#rotaOn").selectOption({ label: "Tom (usually)" });
  await matt.getByText("Swapped").waitFor();
  await matt.waitForTimeout(600);
  await matt.locator(".sheetclose").click();
}

// A class added today did not run last month, and must not be counted as if
// it had: runsOn describes a standing slot and knows nothing about when the
// gym started running it.
{
  const lastMonth = (() => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  })();
  await matt.goto(BASE + studioHref + `/manage/counts?m=${lastMonth}`);
  await matt.locator(".admintop h1").waitFor();
  await matt.waitForTimeout(400);
  const body = await matt.locator("body").innerText();
  if (/\bTom\b/.test(body) && !/Nobody was on a class/.test(body))
    fail("a class added today was counted against a month before it existed");
  console.log("counting starts when the class did ok");
}

// A shift is work, not a listing. It belongs in the private feed (a signed
// token) and must never reach the coach's public calendar or their page,
// because a coach who wants no public presence still takes shifts.
{
  const ics = await tom.request.get(BASE + "/api/cal/tom");
  if (!ics.ok()) fail("the public coach feed is " + ics.status());
  if ((await ics.text()).includes("HYROX"))
    fail("a gym shift leaked into the coach's public calendar feed");
  await tom.goto(BASE + "/tom");
  if ((await tom.locator("body").innerText()).includes("HYROX"))
    fail("a gym shift leaked onto the coach's public page");
  console.log("a shift stays off the coach's public side ok");
}

// ---- unless the coach says otherwise
//
// Off, a shift is in their calendar and nowhere else. On, the classes they
// actually teach are on the page that answers "how do I train with you",
// which is what a coach teaching at four gyms needs. Theirs to decide, and a
// different question from the gym naming anybody, which stays off either way.
{
  await tom.goto(BASE + "/app?acct=1");
  await openSetting(tom, "Your page");
  const sw = tom.locator(".sheet .setrow", { hasText: "Gym shifts on your page" });
  await sw.waitFor();
  if (!/calendar only/i.test(await sw.innerText())) fail("the switch should start off");
  await sw.click();
  await tom.waitForTimeout(900);

  await tom.goto(BASE + "/tom");
  const shown = tom.locator(".ps-event", { hasText: "HYROX" });
  await shown.first().waitFor();
  // A specific date rather than a count: the page's window is seven populated
  // days, so dropping one Thursday just pulls the next one into view.
  const thu = weekDay(10); // Thursday of next week, always ahead of today
  const onThu = tom.locator(`.ps-event[data-d="${thu}"]`, { hasText: "HYROX" });
  if ((await onThu.count()) !== 1) fail("his page should carry the shift on " + thu);
  // The class belongs to the gym, so its page lives under the studio. Pointing
  // it at the coach's handle would 404: it isn't theirs to serve.
  const href = await shown.first().getAttribute("href");
  if (!href?.startsWith("/s/")) fail("a shift should open under the gym: " + href);
  const ics = await tom.request.get(BASE + "/api/cal/tom");
  if (!(await ics.text()).includes("HYROX"))
    fail("the shift never reached the coach's public feed");
  console.log("shifts on the coach's page and feed ok");

  // The gym's own schedule still names nobody. Two switches, and this one was
  // never the gym's to flip.
  {
    const anonCtx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const anon = await anonCtx.newPage();
    anon.setDefaultTimeout(15000);
    await anon.goto(BASE + studioHref);
    await anon.locator(".ps-event", { hasText: "HYROX" }).first().waitFor();
    if ((await anon.locator(".ps-week").innerText()).includes("Tom"))
      fail("a coach's own switch named them on the gym's schedule");
    await anonCtx.close();
  }
  console.log("the gym's schedule still names nobody ok");

  // A date somebody else is covering is not a date he teaches, so it comes off
  // his page. Getting this wrong tells people to turn up to the wrong class.
  await matt.goto(BASE + studioHref + "/manage?w=1");
  await matt.locator(".ps-event", { hasText: "HYROX" }).first().click();
  await matt.locator("#rotaOn").waitFor();
  await matt.locator("#rotaOn").selectOption({ label: "Julia" });
  await matt.getByText("Swapped").waitFor();
  await matt.waitForTimeout(800);
  await tom.goto(BASE + "/tom");
  await tom.waitForTimeout(400);
  if (await tom.locator(`.ps-event[data-d="${thu}"]`, { hasText: "HYROX" }).count())
    fail("a covered date should leave his page: " + thu);
  console.log("a covered date comes off the coach's page ok");

  // Put the rota back, then switch off: calendar only again. The sheet is
  // still up from the swap above, so this reuses it rather than reopening.
  await matt.locator("#rotaOn").selectOption({ label: "Tom (usually)" });
  await matt.getByText("Swapped").waitFor();
  await matt.waitForTimeout(700);
  await matt.locator(".sheetclose").first().click();

  await tom.goto(BASE + "/app?acct=1");
  await openSetting(tom, "Your page");
  await tom.locator(".sheet .setrow", { hasText: "Gym shifts on your page" }).click();
  await tom.waitForTimeout(900);
  await tom.goto(BASE + "/tom");
  await tom.waitForTimeout(400);
  if (await tom.locator(".ps-event", { hasText: "HYROX" }).count())
    fail("turning it off should take the shifts back off the page");
  console.log("the switch turns it back off ok");
}

// ---- the coach's own half of the rota
//
// Fifteen coaches, not one manager. "I can't make Thursday" is a text message
// somebody loses today; here it opens the slot and tells the people who could
// take it, and one of them closes it without the manager in the middle.
{
  const thu = weekDay(10);
  await tom.goto(BASE + "/app");
  const mine = tom.locator(`#day-${thu} .ps-event`, { hasText: "HYROX" });
  await mine.waitFor();
  // On his own screen whatever his public switch says: not knowing you were
  // on is the thing the spreadsheet cost somebody.
  if (!/shift/i.test(await mine.innerText()))
    fail("a shift should say it isn't his to edit");
  await mine.click();
  // The class, not the adder. It belongs to the gym.
  await tom.locator(".classoverlay-nm", { hasText: "HYROX" }).waitFor();
  // His own shift: the floating pill is Manage shift, not Book or Add, and
  // the old boxed CTA is gone with it.
  if (await tom.getByRole("button", { name: /give up this shift/i }).count())
    fail("the Your shift box should have made way for the Manage shift pill");
  await tom.locator(".classoverlay-cta").getByRole("button", { name: "Manage shift" }).click();
  // No shift list yet, so the sheet holds only the give-up: Transfer has
  // nobody to offer, and a door to an empty room is not a door.
  {
    const rows = (await tom.locator(".sheet .setrow .t").allInnerTexts()).map((t) => t.trim());
    if (rows.length !== 1 || !/Give up this shift/.test(rows[0]))
      fail("before a shift list exists the sheet should only give up: " + rows.join("|"));
  }
  await tom.locator(".sheet .setrow", { hasText: "Give up this shift" }).click();
  // It asks first: the notice goes out the moment it happens, so no single
  // tap does it. Keep it changes nothing; Give it up does the thing.
  await tom.getByRole("heading", { name: "Give up this shift?" }).waitFor();
  await tom.getByRole("button", { name: "Keep it" }).click();
  await tom.waitForTimeout(400);
  if (await tom.getByText("Handed back").count())
    fail("Keep it should not have handed the shift back");
  await tom.locator(".classoverlay-cta").getByRole("button", { name: "Manage shift" }).click();
  await tom.locator(".sheet .setrow", { hasText: "Give up this shift" }).click();
  await tom.getByRole("heading", { name: "Give up this shift?" }).waitFor();
  await tom.getByRole("button", { name: "Give it up" }).click();
  await tom.getByText("Handed back").waitFor();
  await tom.waitForTimeout(900);
  // The sheet now says what is true: nobody is on it, and he teaches here, so
  // he could take it back.
  await tom.getByRole("button", { name: /take it/i }).waitFor();
  console.log("handing a date back opens the slot ok");

  // Everyone who could cover it hears, not just the manager.
  await julia.goto(BASE + "/updates");
  const call = julia.locator(".notifrow", { hasText: "HYROX needs somebody" });
  await call.waitFor();
  await call.click();
  await julia.locator(".classoverlay-nm", { hasText: "HYROX" }).waitFor();
  await julia.getByRole("button", { name: /take it/i }).click();
  await julia.getByText("It's yours").waitFor();
  await julia.waitForTimeout(900);
  console.log("a coach takes an open date ok");

  // It moved, on the rota and on both their schedules.
  await matt.goto(BASE + studioHref + "/manage?w=1");
  const onRota = matt.locator(".ps-event", { hasText: "HYROX" }).first();
  await onRota.waitFor();
  const txt = await onRota.innerText();
  if (!txt.includes("Julia") || !/covering/i.test(txt))
    fail("the rota should show who actually took it: " + txt);
  await tom.goto(BASE + "/app");
  await tom.waitForTimeout(400);
  if (await tom.locator(`#day-${thu} .ps-event`, { hasText: "HYROX" }).count())
    fail("a date he gave up should leave his own schedule");
  await julia.goto(BASE + "/app");
  await julia.locator(`#day-${thu} .ps-event`, { hasText: "HYROX" }).waitFor();
  console.log("the date moves between both their schedules ok");

  // And the manager is told, because it is still their rota.
  await matt.goto(BASE + "/updates");
  await matt.locator(".notifrow", { hasText: "took HYROX" }).waitFor();
  console.log("the manager is told without having to do it ok");
}

// ---- the shift list, and handing a date straight to somebody
//
// Anyone may say they coach at a gym, and not everyone who does takes the
// group classes, so the managers name who a shift can be handed to. Once the
// list exists, "can you take my Thursday" stops being a text message plus a
// manager: the coach hands the date over and everybody who should know hears.
{
  // The manager names Julia, and only Julia.
  await matt.goto(BASE + studioHref + "/manage");
  await matt.getByRole("button", { name: "Shift list" }).click();
  await matt.locator(".sheet h2", { hasText: "Shift list" }).waitFor();
  {
    const names = (await matt.locator(".sheet .setrow .t").allInnerTexts()).map((t) => t.trim());
    if (!names.includes("Julia") || !names.includes("Tom"))
      fail("the list should offer everyone who lists the studio: " + names.join("|"));
  }
  await matt.locator(".sheet .setrow", { hasText: "Julia" }).click();
  await matt.waitForTimeout(600);
  if ((await matt.locator('.sheet .setrow[aria-checked="true"]').count()) !== 1)
    fail("only Julia should be on the shift list");
  await matt.locator(".sheetclose").first().click();
  console.log("the manager names the shift list ok");

  // Tom hands a Thursday he is on straight to her. Matt coaches here too and
  // is not on the list, so he is not offered.
  const nextThu = weekDay(17);
  await tom.goto(BASE + "/app");
  const mine = tom.locator(`#day-${nextThu} .ps-event`, { hasText: "HYROX" });
  await mine.waitFor();
  await mine.click();
  await tom.locator(".classoverlay-nm", { hasText: "HYROX" }).waitFor();
  await tom.locator(".classoverlay-cta").getByRole("button", { name: "Manage shift" }).click();
  // Two rows, two verbs: the give-up, and one Transfer door over the whole
  // list, however long the gym's shift list grows.
  {
    const rows = (await tom.locator(".sheet .setrow .t").allInnerTexts()).map((t) => t.trim());
    if (rows.length !== 2 || !/Give up this shift/.test(rows.join("|")) || !/Transfer shift/.test(rows.join("|")))
      fail("the sheet should offer the give-up and one Transfer row: " + rows.join("|"));
  }
  await tom.locator(".sheet .setrow", { hasText: "Transfer shift" }).click();
  await tom.getByRole("heading", { name: "Transfer shift" }).waitFor();
  // Behind it, the gym's list and nobody else: Julia is on it, Matt is not.
  {
    const rows = (await tom.locator(".sheet .setrow .t").allInnerTexts()).map((t) => t.trim());
    if (rows.length !== 1 || !/Julia/.test(rows[0]) || /Matt/.test(rows.join("|")))
      fail("Transfer should offer the shift list, nobody else: " + rows.join("|"));
  }
  await tom.locator(".sheet .setrow", { hasText: "Julia" }).click();
  // Named, then asked: the confirm says who takes it before anyone is told.
  await tom.getByRole("heading", { name: "Transfer to Julia?" }).waitFor();
  await tom.getByRole("button", { name: "Transfer to Julia" }).click();
  await tom.getByText("Transferred to Julia").waitFor();
  await tom.waitForTimeout(900);
  console.log("a date handed straight to a coach ok");

  // She hears it came from him; the manager gets the receipt; the rota says
  // who is really on it.
  await julia.goto(BASE + "/updates");
  const got = julia.locator(".notifrow", { hasText: "You're covering HYROX" }).first();
  await got.waitFor();
  if (!/Tom handed it to you/.test(await got.innerText()))
    fail("the hand-off should say who it came from");
  await matt.goto(BASE + "/updates");
  await matt.locator(".notifrow", { hasText: "Tom handed HYROX to Julia" }).first().waitFor();
  await matt.goto(BASE + studioHref + "/manage?w=2");
  const onRota = matt.locator(".ps-event", { hasText: "HYROX" }).first();
  await onRota.waitFor();
  const txt = await onRota.innerText();
  if (!txt.includes("Julia") || !/covering/i.test(txt))
    fail("the rota should show the hand-off: " + txt);
  console.log("both sides and the rota hear about the hand-off ok");
}

// And it's in his calendar, which is the fix for not knowing you were on.
// A signed link, no Google account and no permission from anybody, so the
// coach who wants nothing public still gets their week.
{
  await tom.goto(BASE + "/app?acct=1");
  await openSetting(tom, "Calendar & sync");
  const row = tom.locator(".sheet .setrow", { hasText: "Your week in your calendar" });
  await row.waitFor();
  if (!/shifts you.re on/i.test(await row.innerText()))
    fail("a coach on a rota should be told the feed carries their shifts");
  await row.click();
  const link = tom.locator('.installhow a[href^="webcal:"]');
  await link.waitFor();
  const webcal = await link.getAttribute("href");
  const ics = await tom.request.get(webcal.replace(/^webcal:/, "http:"));
  if (!ics.ok()) fail("the personal calendar feed is " + ics.status());
  const text = await ics.text();
  if (!text.includes("HYROX")) fail("the shift never reached the coach's calendar");
  if (!text.includes("Ironbound")) fail("the entry should say who the shift is for");
  console.log("the shift is in the coach's calendar ok");
}

// ---- the public side: the gym's week, under the gym's name
{
  // Tabs, and the schedule leads because that's what the link is for.
  const anonCtx = await b.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (gym smoke bot)",
  });
  const anon = await anonCtx.newPage();
  anon.setDefaultTimeout(15000);
  await anon.goto(BASE + studioHref);
  await anon.locator(".pubtabs .pubtab.sel", { hasText: "Schedule" }).waitFor();
  await anon.locator(".ps-event", { hasText: "HYROX" }).waitFor();
  // Under the gym's name and nobody else's: this is what lets Tom teach here
  // without a public profile, and stops a schedule becoming a leaderboard.
  if ((await anon.locator(".ps-week").innerText()).includes("Tom"))
    fail("the gym's public week named the coach");
  await anon.locator(".pubtabs .pubtab", { hasText: "Info" }).click();
  await anon.waitForURL("**/about");
  await anon.getByRole("heading", { name: "Where it is" }).waitFor();
  if (await anon.locator(".ps-event").count()) fail("About should not carry the schedule");
  console.log("studio tabs ok (schedule leads, one URL per section)");

  // The class opens as a real page from a link, the same as a coach's.
  await anon.goto(BASE + studioHref);
  const first = anon.locator(".ps-event").first();
  const firstName = (await first.locator(".ps-enm").innerText()).trim();
  const href = await first.getAttribute("href");
  if (!href?.startsWith("/s/")) fail("a gym class should live under the studio: " + href);
  await anon.goto(BASE + href);
  // Whatever the first row was, the link has to open that class.
  await anon.locator(".classoverlay-nm", { hasText: firstName }).waitFor();
  // The rota is for the people who work there. A visitor sees a class.
  if (await anon.locator(".shiftbox").count())
    fail("the rota controls reached somebody who doesn't coach here");
  await anonCtx.close();
  console.log("a gym class opens from its own link ok");
}

// A member can add every class at the gym, whether or not any coach here uses
// the app publicly. That is the whole point of the gym owning the class.
{
  const memCtx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const mem = await memCtx.newPage();
  mem.setDefaultTimeout(15000);
  await mem.goto(BASE + "/");
  await mem.getByRole("button", { name: "Sign up with email" }).click();
  await mem.locator(".roleseg button", { hasText: "here to train" }).click();
  await mem.getByPlaceholder("you@example.com").fill("mem@example.com");
  await mem.getByPlaceholder("Password").fill("pass-word-123");
  await mem.getByRole("button", { name: "Create account" }).click();
  await mem.getByRole("button", { name: "Not now" }).click().catch(() => {});
  await mem.getByText("Pick your link.").waitFor();
  await mem.getByPlaceholder("Your name").fill("Mem Ber");
  await mem.getByRole("button", { name: "Claim it" }).click();
  await mem.getByRole("heading", { name: "Add a photo." }).waitFor();
  await mem.getByRole("button", { name: "Continue" }).click();
  await mem.getByRole("heading", { name: "Tell people who you are." }).waitFor();
  await fillLocation(mem);
  await mem.getByRole("button", { name: "Finish setup" }).click();
  await mem.waitForURL("**/feed");

  await mem.goto(BASE + studioHref);
  await mem.locator(".ps-event", { hasText: "HYROX" }).click();
  await mem.locator(".classoverlay-nm", { hasText: "HYROX" }).waitFor();
  await mem.locator(".ovcta-save").click();
  await mem.locator(".favtoast.on").waitFor();
  await mem.goto(BASE + "/week");
  await mem.locator(".ps-enm", { hasText: "HYROX" }).waitFor();
  await memCtx.close();
  console.log("a member can add the gym's class ok (it lands in their plans)");
}

// The coach on the slot can't mark themselves down for it: teaching it isn't
// attending it, and the class belongs to the gym so the owner test alone
// would have let this through.
{
  await tom.goto(BASE + studioHref);
  await tom.locator(".ps-event", { hasText: "HYROX" }).click();
  await tom.locator(".classoverlay-nm").waitFor();
  // Not offered at all. A button setGoing would refuse is worse than no button.
  if (await tom.locator(".ovcta-save").count())
    fail("the coach on a shift was offered a Save that would fail");
  // And a gym is a place, not a face: nothing here claims to be coached by it.
  const said = await tom.locator(".classoverlay-body").innerText();
  if (/coached by/i.test(said)) fail("a gym rendered in the coach slot: " + said);
  console.log("a coach can't attend their own shift ok (and a gym isn't a coach)");
}

// ---- the shapes the coach's adder has always had, now on a gym
//
// Several days at once, a date that only happens once, and taking a single
// date out of a standing slot. A gym had none of these while it had a form of
// its own, which is the argument for it not having one.
{
  const rowOn = (day, name) =>
    matt.locator(".rotaday", { hasText: day }).locator(".ps-event", { hasText: name });

  await matt.goto(BASE + studioHref + "/manage");
  await matt.locator(".rotaday", { hasText: "Sunday" }).getByRole("button", { name: "Add" }).click();
  await matt.locator("#fName").waitFor();
  await matt.locator("#fName").fill("Open Gym");
  await matt.getByRole("button", { name: "Sa", exact: true }).click();
  await matt.locator("#fStart").fill("10:00");
  await matt.locator("#fCoach").selectOption({ label: "Julia" });
  await matt.getByRole("button", { name: "Add to the schedule" }).click();
  await matt.getByText("Added 2 classes").waitFor();
  await matt.waitForTimeout(700);
  for (const d of ["Saturday", "Sunday"])
    if (!(await rowOn(d, "Open Gym").count()))
      fail("picking two days should make two slots: " + d + " has none");
  console.log("two days, two slots ok");

  // A workshop is a date, not a habit.
  await matt.goto(BASE + studioHref + "/manage?w=1");
  await matt.locator(".rotaday", { hasText: "Wednesday" }).getByRole("button", { name: "Add" }).click();
  await matt.locator("#fName").waitFor();
  await matt.locator("#fName").fill("Barbell Clinic");
  await matt.getByRole("button", { name: "One-time" }).click();
  await matt.locator('input[aria-label="Class date"]').fill(weekDay(9));
  await matt.locator("#fStart").fill("18:00");
  await matt.getByRole("button", { name: "Add to the schedule" }).click();
  await matt.getByText("Added to the week").waitFor();
  await matt.waitForTimeout(700);
  if (!(await rowOn("Wednesday", "Barbell Clinic").count()))
    fail("a one-off should land on the week it falls in");
  await matt.goto(BASE + studioHref + "/manage?w=2");
  await matt.locator(".rota").waitFor();
  await matt.waitForTimeout(400);
  if (await matt.locator(".ps-event", { hasText: "Barbell Clinic" }).count())
    fail("a one-off should not repeat");
  console.log("a one-off runs once ok");

  // One Sunday off: the slot keeps running, that date is stamped out of it.
  await matt.goto(BASE + studioHref + "/manage");
  await rowOn("Sunday", "Open Gym").click();
  await matt.getByRole("button", { name: "Take it off the week" }).click();
  await matt.getByRole("button", { name: /^Just / }).click();
  await matt.waitForTimeout(900);
  if (await rowOn("Sunday", "Open Gym").count())
    fail("a cancelled date should come off the week");
  await matt.goto(BASE + studioHref + "/manage?w=1");
  await matt.locator(".rota").waitFor();
  if (!(await rowOn("Sunday", "Open Gym").count()))
    fail("cancelling one date should leave the standing slot alone");
  console.log("one date off ok (the slot keeps running)");

  // And the slot itself, gone. Its Sunday twin is a separate slot and stays.
  await matt.goto(BASE + studioHref + "/manage");
  await rowOn("Saturday", "Open Gym").click();
  await matt.getByRole("button", { name: "Take it off the week" }).click();
  await matt.getByRole("button", { name: /^Every / }).click();
  await matt.getByText("Taken off the week").waitFor();
  await matt.waitForTimeout(700);
  if (await rowOn("Saturday", "Open Gym").count())
    fail("the Saturday slot should be gone");
  await matt.goto(BASE + studioHref + "/manage?w=1");
  await matt.locator(".rota").waitFor();
  if (!(await rowOn("Sunday", "Open Gym").count()))
    fail("deleting one slot took its Sunday twin with it");
  console.log("taking a slot off the week ok");
}

// ---- the migration every gym has: the coach listed it first
//
// Tom's own Warm Up at Ironbound predates Ironbound running its schedule. The
// gym now lists the same slot with him on it, so there are two of the same
// class. Nobody should see it twice, and clearing it up must not tell the
// people who saved it that their class was cancelled.
{
  // A member saves Tom's own copy, so the merge has something to carry.
  const memCtx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const mem = await memCtx.newPage();
  mem.setDefaultTimeout(15000);
  await mem.goto(BASE + "/");
  await mem.getByRole("button", { name: "Sign up with email" }).click();
  await mem.locator(".roleseg button", { hasText: "here to train" }).click();
  await mem.getByPlaceholder("you@example.com").fill("dupe@example.com");
  await mem.getByPlaceholder("Password").fill("pass-word-123");
  await mem.getByRole("button", { name: "Create account" }).click();
  await mem.getByRole("button", { name: "Not now" }).click().catch(() => {});
  await mem.getByText("Pick your link.").waitFor();
  await mem.getByPlaceholder("Your name").fill("Dee Dupe");
  await mem.getByRole("button", { name: "Claim it" }).click();
  await mem.getByRole("heading", { name: "Add a photo." }).waitFor();
  await mem.getByRole("button", { name: "Continue" }).click();
  await mem.getByRole("heading", { name: "Tell people who you are." }).waitFor();
  await fillLocation(mem);
  await mem.getByRole("button", { name: "Finish setup" }).click();
  await mem.waitForURL("**/feed");
  await mem.goto(BASE + "/tom");
  await mem.locator(".ps-event", { hasText: "Warm Up" }).first().click();
  await mem.locator(".classoverlay-nm", { hasText: "Warm Up" }).waitFor();
  await mem.locator(".ovcta-save").click();
  await mem.locator(".favtoast.on").waitFor();
  await mem.goto(BASE + "/week");
  await mem.locator(".ps-enm", { hasText: "Warm Up" }).waitFor();

  // The gym lists the same slot: same name, same day, same time, same place.
  await matt.goto(BASE + studioHref + "/manage");
  await matt.locator(".rotaday", { hasText: "Monday" }).getByRole("button", { name: "Add" }).click();
  await matt.locator("#fName").waitFor();
  await matt.locator("#fName").fill("Warm Up");
  await matt.locator("#fStart").fill("06:00");
  await matt.locator("#fCoach").selectOption({ label: "Tom" });
  await matt.getByRole("button", { name: "Add to the schedule" }).click();
  await matt.getByText("Added to the week").waitFor();
  await matt.waitForTimeout(800);

  // Tom is told, rather than left to wonder why there are two.
  await tom.goto(BASE + "/updates");
  await tom.locator(".notifrow", { hasText: "lists Warm Up too" }).waitFor();

  // His own screen keeps both, because it's the only place he can act on it.
  await tom.goto(BASE + "/app");
  const dupe = tom.locator(".ps-event", { hasText: "Warm Up" }).first();
  await dupe.waitFor();
  if (!/duplicate/i.test(await dupe.innerText()))
    fail("his own copy should say it's a duplicate");

  // Nobody else sees it twice, whether or not he shares his shifts.
  await tom.goto(BASE + "/app?acct=1");
  await openSetting(tom, "Your page");
  await tom.locator(".sheet .setrow", { hasText: "Gym shifts on your page" }).click();
  await tom.waitForTimeout(900);
  await tom.goto(BASE + "/tom");
  await tom.waitForTimeout(400);
  const mondays = await tom
    .locator('.ps-event[data-d="' + weekDay(7) + '"]', { hasText: "Warm Up" })
    .count();
  if (mondays !== 1) fail(`Warm Up should appear once on his page, got ${mondays}`);
  // And the one that shows is the gym's, which lives under the studio.
  const href = await tom
    .locator('.ps-event[data-d="' + weekDay(7) + '"]', { hasText: "Warm Up" })
    .getAttribute("href");
  if (!href?.startsWith("/s/")) fail("the gym's copy should be the one shown: " + href);
  console.log("a duplicate shows once, and the gym's is the one ok");

  // Hand it over: his row goes, and the person who saved it keeps their spot.
  await tom.goto(BASE + "/app");
  await tom.locator(".ps-event", { hasText: "Warm Up" }).first().click();
  // One retry: under suite load the row has been seen to paint before its
  // tap handler attaches, so the first click lands on nothing (same
  // precedent as the goto stragglers). A second miss is a real failure.
  try {
    await tom.getByRole("heading", { name: /is the gym.s now/ }).waitFor({ timeout: 5000 });
  } catch {
    console.log("merge sheet missed the first tap; tapping once more");
    await tom.locator(".ps-event", { hasText: "Warm Up" }).first().click();
    await tom.getByRole("heading", { name: /is the gym.s now/ }).waitFor();
  }
  await tom.getByRole("button", { name: "Hand it over" }).click();
  await tom.getByText(/Handed over/).waitFor();
  await tom.waitForTimeout(900);
  if (await tom.locator(".ps-dupe").count()) fail("the duplicate should be gone");
  await mem.goto(BASE + "/week");
  await mem.locator(".ps-enm", { hasText: "Warm Up" }).waitFor();
  const told = await mem.goto(BASE + "/updates");
  void told;
  if (await mem.locator(".notifrow", { hasText: "is off" }).count())
    fail("handing a class over is not a cancellation and must not read as one");
  await memCtx.close();
  console.log("handing it over keeps the saves and cancels nothing ok");
}

// Julia, the other manager, sees the same rota
await julia.goto(BASE + studioHref + "/manage");
await julia.locator(".ps-event", { hasText: "HYROX" }).waitFor();
console.log("the second manager sees the same week ok");

// a coach who doesn't run the place can't reach it at all
await tom.goto(BASE + studioHref + "/manage");
await tom.waitForTimeout(500);
if (await tom.locator(".rota").count())
  fail("the rota should not exist for a coach who doesn't run the studio");
if ((await tom.locator("body").innerText()).includes("HYROX"))
  fail("the rota leaked its classes to a coach who doesn't run the studio");
console.log("the rota is closed to everyone else ok");

await b.close();
console.log("GYM CHECKS PASSED");
