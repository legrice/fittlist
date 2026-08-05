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
/** Put a fixture late enough that it cannot have run yet.
 *
 *  Every public surface drops an occurrence once it has ended, which is the
 *  app working as designed. A fixture on weekday W at 07:00 therefore shows
 *  on six days of the week and vanishes on the seventh: today's has been and
 *  gone, and next week's is seven days out, past the end of the window these
 *  pages draw. That made this suite pass or fail by the hour, and it took a
 *  Tuesday afternoon to notice.
 *
 *  23:00 to 23:59 is the fix: it ends a minute before midnight, so it is
 *  still ahead on its own day whenever the suite runs. The end has to be set
 *  explicitly because the form derives it from the start, and 23:00 plus an
 *  hour wraps to 00:00. */
const lateSlot = async (pg) => {
  await pg.locator("#fStart").fill("23:00");
  await pg.locator("#fEnd").fill("23:59");
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
    await lateSlot(p);
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

// Running a place shows up on your own account. It used to be reachable only
// by navigating to the studio's page and finding the floating pill, which is
// no way to find something you own, and Where I coach is no help either: that
// is built from coach_studios and a manager need not have a row in it.
{
  await matt.goto(BASE + "/you");
  await matt.locator(".acctwrap").waitFor();
  const row = matt.locator(".setrow", { hasText: "Ironbound" });
  await row.waitFor();
  const href = await row.getAttribute("href");
  // It opens the shifts screen, not the public page: what you came to your
  // own account for is the work, and the role tag says which kind you are.
  if (!href?.endsWith("/shifts")) fail("the row should open the shifts screen: " + href);
  if (!/Admin/.test(await row.innerText())) fail("a manager's row should say Admin");
  await row.click();
  await matt.waitForURL(/\/shifts/);
  await matt.locator(".staffbar").waitFor();
  // And closing goes back where you came from, which is the only place you
  // can have come from. It used to land on the studio's public page, which
  // is a page a manager never asked for and has no way back off.
  await matt.locator(".acctclose").click();
  await matt.waitForURL(/\/you$/);
  await matt.locator(".acctwrap").waitFor();
  console.log("the studio you run is on your own account ok (and closes back to it)");
}
// A coach who works here but runs nothing gets the row too, tagged Coach:
// the spec's Your studios is anybody affiliated as staff, and the shifts
// screen is exactly what a staff coach never had a door to.
{
  await tom.goto(BASE + "/you");
  await tom.locator(".acctwrap").waitFor();
  const row = tom.locator(".setrow", { hasText: "Ironbound" });
  await row.waitFor();
  const txt = await row.innerText();
  if (!/Coach/.test(txt)) fail("a staff coach's row should say Coach: " + txt);
  if (/Admin/.test(txt)) fail("a staff coach is not an admin");
}

// The studio picker autocompletes names, so read the slug rather than guess it.
await matt.goto(BASE + "/matt/studios");
const studioHref = await matt.locator('a[href^="/s/"]').first().getAttribute("href");
if (!studioHref) fail("no studio on the coach's page");
console.log("studio at " + studioHref);

// The rota, from the shifts screen. The studio's public page carries no
// manager's control at all now: the tools are not drawn in the shop window.
await matt.goto(BASE + studioHref);
if (await matt.locator(".studioadmin").count())
  fail("the public studio page should carry no manager's door");
await matt.goto(BASE + studioHref + "/shifts");
// The two weekly acts are named buttons; the overflow holds the rest, and
// with the account on that includes the counts and the page views.
await matt.locator(".staffbar .staffmore").click();
{
  const rows = (await matt.locator(".sheet .setrow .t").allInnerTexts()).map((t) => t.trim());
  for (const want of ["Shift counter", "Edit studio info", "Share this studio"])
    if (!rows.includes(want)) fail("the overflow is missing " + want + ": " + rows.join("|"));
  // The two that became buttons must not also be rows: one door each. The
  // second reads Staff now, not Coaches: it is everybody who works here.
  for (const gone of ["All shifts", "Staff", "Coaches"])
    if (rows.includes(gone)) fail(gone + " is a button now, not an overflow row: " + rows.join("|"));
}
await matt.locator(".sheet .stat .n").waitFor();
await matt.locator(".sheetclose").first().click();
await matt.waitForFunction(() => !document.querySelector(".sheet"));
// Staff, not Coaches: the list is everybody who works here.
{
  const words = (await matt.locator(".staffbar a").allInnerTexts()).map((t) => t.trim());
  if (!words.some((w) => /Staff/.test(w)))
    fail("the studio's second button should read Staff: " + words.join("|"));
  if (words.some((w) => /Coaches/.test(w)))
    fail("Coaches was the narrower word: " + words.join("|"));
}
await matt.locator(".staffbar a", { hasText: "All shifts" }).click();
await matt.waitForURL("**/manage");
await matt.locator(".admintop h1").waitFor();

// The rota is a full-screen sheet over the screen that opened it: it carries
// no doors of its own (they were the two you arrived past), and closing goes
// back to the shifts screen rather than to the studio's public page.
{
  for (const gone of ["Shifts worked", "Shift counter", "Staff"])
    if (await matt.locator(".pad .btn", { hasText: gone }).count())
      fail(gone + " should not be a door on the rota: you arrived through it");
  await matt.locator(".acctclose").click();
  await matt.waitForURL(/\/shifts$/);
  await matt.locator(".staffbar").waitFor();
  await matt.locator(".staffbar a", { hasText: "All shifts" }).click();
  await matt.waitForURL("**/manage");
  await matt.locator(".admintop h1").waitFor();
}

// add a class with nobody on it. The form is the coach's own adder, handed the
// gym's studio and one extra field, so the ids are the adder's.
await matt.locator(".rotaday", { hasText: "Thursday" }).getByRole("button", { name: "Add" }).click();
await matt.locator("#fName").waitFor();
if (await matt.locator("#fCoach").count() === 0) fail("a gym's adder needs the rota field");
if (await matt.locator(".studio-sel").count()) fail("a gym should never be asked for a studio");
if (await matt.getByText("Who sees this?").count()) fail("a gym has no private classes");
await matt.locator("#fName").fill("HYROX");
await lateSlot(matt);
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
if (!/THU|Thu/i.test(body) || !body.includes("11:00p")) fail("the notice should say when: " + body);
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

  // Everything a coach's class carries, on a gym's too, the photograph
  // included. It was accepted by the form and dropped by every gym write, so
  // a manager filling a rota picked a picture and lost it on save.
  await matt.locator("#fType").selectOption({ label: "Strength" });
  await matt.locator("#fDesc").fill("Bring shoes you can lift in.");
  await matt.locator(".classpho input[type=file]").setInputFiles({
    name: "class.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await matt.getByRole("button", { name: "Change photo" }).waitFor();
  await matt.getByRole("button", { name: "+ Add link" }).click();
  const linkBox = matt.locator('input[aria-label="Link"]').last();
  await linkBox.fill("https://ironbound.example/book");
  await matt.locator(".linktag").first().waitFor();
  await lateSlot(matt);
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
  if (!(await matt.locator(".classpho .classpho-img:not(.classpho-empty)").count()))
    fail("the photo didn't survive a save");
  await matt.locator(".sheetclose").click();
  console.log("the details come back on an edit ok");

  // And the next slot pulled in from the catalogue arrives wearing it. This is
  // the whole point of adding a class once: a manager filling a week should
  // pick the name and be done.
  await matt.locator(".rotaday", { hasText: "Saturday" }).getByRole("button", { name: "Add" }).click();
  await matt.locator("#fName").click();
  await matt.locator(".namesug button", { hasText: "Warm Up" }).first().click();
  await matt.waitForTimeout(300);
  if (!(await matt.locator(".classpho .classpho-img:not(.classpho-empty)").count()))
    fail("pulling a class in should bring its photo");
  await matt.locator(".sheetclose").click();
  await matt.waitForTimeout(400);
  console.log("a class pulled in from the catalogue brings its photo ok");

  // ---- days times times
  //
  // A gym's week is a grid. The same class runs at several times on the same
  // days, which is one slot per cell and was one add per cell. Adding the
  // days and the times together is how a manager fills a week in two passes
  // instead of twenty-three.
  {
    await matt.locator(".rotaday", { hasText: "Sunday" }).getByRole("button", { name: "Add" }).click();
    await matt.locator("#fName").fill("Grid Class");
    await matt.locator("#fStart").fill("06:00");
    // Two more days on top of the one the row opened.
    await matt.getByRole("button", { name: "We", exact: true }).click();
    await matt.getByRole("button", { name: "Fr", exact: true }).click();
    await matt.getByRole("button", { name: "+ Also at another time" }).click();
    await matt.locator('input[aria-label="Also at, time 2"]').fill("07:00");
    await matt.getByRole("button", { name: "+ Also at another time" }).click();
    await matt.locator('input[aria-label="Also at, time 3"]').fill("17:00");

    // The count before committing: a cross product grows fast and a manager
    // should see the number rather than discover it.
    const n = await matt.locator(".alsoat-n").innerText();
    if (!/Adds 9 classes/.test(n)) fail("the grid should say what it will make: " + n);

    await matt.getByRole("button", { name: "Add to the schedule" }).click();
    // The toast names what was actually made. It counted days for a long
    // time, which was right while one add was one slot per day.
    await matt
      .getByText("Added 9 classes")
      .waitFor()
      .catch(async () => {
        const t = await matt.locator(".toast, .favtoast, .errorcopy").allInnerTexts();
        fail("the grid should have made nine: " + JSON.stringify(t));
      });
    await matt.waitForTimeout(900);

    for (const [day, count] of [["Sunday", 3], ["Wednesday", 3], ["Friday", 3]]) {
      const got = await matt.locator(".rotaday", { hasText: day }).locator(".ps-event", { hasText: "Grid Class" }).count();
      if (got !== count) fail(`${day} should hold ${count} Grid Class slots, got ${got}`);
    }
    console.log("days times times ok (one add, nine slots)");

    // A second pass over the same class leaves what already runs alone: those
    // slots may carry a coach, a swap and a room full of members' plans.
    await matt.locator(".rotaday", { hasText: "Sunday" }).getByRole("button", { name: "Add" }).click();
    await matt.locator("#fName").fill("Grid Class");
    await matt.locator("#fStart").fill("06:00");
    await matt.getByRole("button", { name: "+ Also at another time" }).click();
    await matt.locator('input[aria-label="Also at, time 2"]').fill("19:00");
    await matt.getByRole("button", { name: "Add to the schedule" }).click();
    await matt.getByText("Added to the week").waitFor();
    await matt.waitForTimeout(900);
    const after = await matt.locator(".rotaday", { hasText: "Sunday" }).locator(".ps-event", { hasText: "Grid Class" }).count();
    if (after !== 4) fail("re-adding should add only the new time, got " + after + " slots");
    console.log("a second pass adds only what is new ok");

    // And editing one of them never fans out: one row is one slot, which is
    // what keeps a swap on it safe.
    await matt.locator(".rotaday", { hasText: "Sunday" }).locator(".ps-event", { hasText: "Grid Class" }).first().click();
    await matt.locator("#fName").waitFor();
    if (await matt.getByRole("button", { name: "+ Also at another time" }).count())
      fail("an edit must not offer the grid: it moves one slot rather than fanning out");
    await matt.locator(".sheetclose").click();
    await matt.waitForTimeout(400);
    console.log("an edit stays one slot ok");
  }
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

// The staff side, for a coach who does not run the place.
//
// This is the hole the staff spec is mostly about: /manage is the managers'
// and a coach who merely works here had no studio screen at all. My shifts is
// the default tab for everyone, admin or not, because a manager is almost
// always also a coach and a manager-only mode that hides their own shifts is
// the thing to avoid.
{
  await tom.goto(BASE + studioHref + "/shifts");
  await tom.locator(".admintop h1").waitFor();
  {
    const sub = await tom.locator(".adminsub").innerText();
    if (!/You coach here/.test(sub)) fail("a staff coach should be told they coach here: " + sub);
  }
  // No admin doors for somebody who does not run the place.
  if (await tom.locator(".staffbar").count()) fail("a staff coach shouldn't get the admin bar");
  {
    const tabs = (await tom.locator(".pubtabs .pubtab").allInnerTexts()).map((t) =>
      t.split("\n")[0].trim(),
    );
    if (tabs.join("|") !== "My shifts|Open") fail("a staff coach gets two tabs: " + tabs.join("|"));
  }
  // He is on the HYROX, so it is on his own tab.
  if (!(await tom.locator(".setrow", { hasText: "HYROX" }).count()))
    fail("Tom's own shift should be on My shifts");
  console.log("a staff coach has a shifts screen ok");

  // The manager gets the same screen plus the extra doors and the queue.
  await matt.goto(BASE + studioHref + "/shifts");
  await matt.locator(".staffbar").waitFor();
  {
    const tabs = (await matt.locator(".pubtabs .pubtab").allInnerTexts()).map((t) =>
      t.split("\n")[0].trim(),
    );
    if (!tabs.includes("Requests")) fail("a manager gets the queue: " + tabs.join("|"));
  }
  console.log("a manager gets the same screen plus the queue ok");
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
  // The counter is reached from the shifts screen's overflow now: the rota
  // carries no doors of its own, because it is a screen you opened from one.
  await matt.goto(BASE + studioHref + "/shifts");
  await matt.locator(".staffbar .staffmore").click();
  await matt.locator(".sheet .setrow", { hasText: "Shift counter" }).click();
  await matt.waitForURL("**/counts");
  await matt.getByRole("heading", { name: "Shift counter" }).waitFor();
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
    // The coach chip, not the whole week's text. `.includes("Tom")` over the
    // page matched the "Tomorrow" day band the moment a fixture put a class
    // on tomorrow, which is a three-letter name colliding with the calendar.
    const named = await anon.locator(".ps-week .ps-ewho").allInnerTexts();
    if (named.some((t) => /Tom/.test(t)))
      fail("a coach's own switch named them on the gym's schedule: " + named.join("|"));
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
  // Approval is on by default now, so taking an open date is an ask and the
  // sheet says so. It would be worse to say "it's yours" about something the
  // studio has not agreed to: she would turn up to a class that is not hers.
  await julia.getByText("Asked the studio").waitFor();
  await julia.waitForTimeout(900);
  console.log("a coach asks for an open date ok");

  // Nothing has moved yet: the rota still shows the slot open, because a
  // pending change never writes a cover.
  await matt.goto(BASE + studioHref + "/manage?w=1");
  {
    const still = matt.locator(".ps-event", { hasText: "HYROX" }).first();
    await still.waitFor();
    if (/Julia/.test(await still.innerText()))
      fail("a pending ask reached the rota before anybody approved it");
  }
  // The manager answers it, and that is the moment it becomes true.
  await matt.goto(BASE + studioHref + "/shifts");
  await matt.locator(".pubtabs .pubtab", { hasText: "Requests" }).click();
  await matt.waitForTimeout(400);
  await matt.locator(".setrow", { hasText: "Julia" }).first().getByRole("button", { name: "Approve" }).click();
  await matt.getByText("Approved").waitFor();
  await matt.waitForTimeout(1000);
  console.log("the studio approves it ok");

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
  await matt.locator(".notifrow", { hasText: /HYROX/ }).first().waitFor();
  console.log("the manager hears about the change ok");
}

// ---- the shift list, and handing a date straight to somebody
//
// Anyone may say they coach at a gym, and not everyone who does takes the
// group classes, so the managers name who a shift can be handed to. Once the
// list exists, "can you take my Thursday" stops being a text message plus a
// manager: the coach hands the date over and everybody who should know hears.
{
  // The manager names Julia, and only Julia. The list lives on the staff
  // screen now, beside who runs the page: two lists of the studio's people.
  await matt.goto(BASE + studioHref + "/manage/staff");
  await matt.locator(".admintop h1", { hasText: "Staff" }).waitFor();
  {
    const names = (await matt.locator('[role="switch"] .t').allInnerTexts()).map((t) => t.trim());
    if (!names.includes("Julia") || !names.includes("Tom"))
      fail("the list should offer everyone who lists the studio: " + names.join("|"));
  }
  await matt.locator('[role="switch"]', { hasText: "Julia" }).click();
  await matt.waitForTimeout(600);
  if ((await matt.locator('[role="switch"][aria-checked="true"]').count()) !== 1)
    fail("only Julia should be on the shift list");
  console.log("the manager names the shift list ok");

  // The keys are the managers' own to hand out: this was an admin-only action,
  // so a gym wanting its own second manager had to write in and ask.
  {
    const mgrs = () => matt.locator(".staffrow");
    if ((await mgrs().count()) !== 2)
      fail("Matt and Julia were both handed the page: " + (await mgrs().count()));
    // Somebody with no account can't be handed anything.
    await matt.locator("#staffEmail").fill("nobody@example.com");
    await matt.getByRole("button", { name: "Add", exact: true }).click();
    await matt.getByText("Nobody with that email has an account yet").waitFor();
    // Tom coaches here and now runs the page too.
    await matt.locator("#staffEmail").fill("tom@example.com");
    await matt.getByRole("button", { name: "Add", exact: true }).click();
    await matt.waitForTimeout(1200);
    if ((await mgrs().count()) !== 3) fail("Tom should run the page now");
    // And he was told, because being handed the keys is not a thing to find
    // out by accident.
    await tom.goto(BASE + "/updates");
    await tom.locator(".notifrow", { hasText: "You run Ironbound" }).waitFor();
    // Taken back off, with the confirm in the way.
    await matt.goto(BASE + studioHref + "/manage/staff");
    await matt.locator(".staffrow", { hasText: "Tom" }).getByRole("button", { name: "Remove" }).click();
    await matt.locator(".confirmsheet").waitFor();
    await matt.getByRole("button", { name: "Remove Tom" }).click();
    await matt.waitForTimeout(900);
    if ((await mgrs().count()) !== 2) fail("Tom should be off the page again");
    console.log("the managers hand the keys out themselves ok");
  }

  // The same hand-over, from the staff screen's own rows. A coach's shifts are
  // listed there and the only thing offered used to be Give up, so "can you
  // take my Thursday" still meant opening the class. Transfer sits beside it
  // now, off the same list and the same action.
  {
    await tom.goto(BASE + studioHref + "/shifts");
    await tom.locator(".pubtabs .pubtab", { hasText: "My shifts" }).click();
    await tom.waitForTimeout(500);
    // Whichever date he is actually holding: Julia is the standing coach by
    // now, so what is left on his list is the covers that came back to him.
    const row = tom.locator(".setrow", { hasText: "HYROX" }).first();
    if (!(await row.count())) fail("Tom should still be on a HYROX date");
    await row.waitFor();
    // One control on the row, and both verbs behind it: two words across from
    // a class name is two things to read and a date that has to truncate.
    for (const word of ["Give up", "Transfer"])
      if (await row.getByRole("button", { name: word, exact: true }).count())
        fail(word + " should be behind the row's overflow, not on it");
    await row.locator(".staffmenu").click();
    {
      const rows = (await tom.locator(".sheet .setrow .t").allInnerTexts()).map((t) => t.trim());
      if (rows.length !== 2 || !rows.includes("Transfer shift") || !rows.includes("Give up this shift"))
        fail("the row's sheet should offer both verbs in full: " + rows.join("|"));
    }
    await tom.locator(".sheet .setrow", { hasText: "Transfer shift" }).click();
    await tom.getByRole("heading", { name: "Transfer shift" }).waitFor();
    // The gym's shift list and nobody else: Julia is on it, Matt coaches here
    // and is not, and Tom is never offered himself.
    {
      const names = (await tom.locator(".sheet .setrow .t").allInnerTexts()).map((t) => t.trim());
      if (names.length !== 1 || names[0] !== "Julia")
        fail("Transfer should offer the shift list, nobody else: " + names.join("|"));
      // A face per person, not a column of identical glyphs: this is the
      // moment somebody picks who to hand a class to.
      if (!(await tom.locator(".sheet .setrow .sendav").count()))
        fail("the transfer list should wear the coaches' avatars");
    }
    await tom.locator(".sheet .setrow", { hasText: "Julia" }).click();
    // It confirms before anybody is told, the same as giving up does.
    await tom.getByRole("heading", { name: "Give HYROX to Julia?" }).waitFor();
    await tom.getByRole("button", { name: "Ask the studio" }).click();
    await tom.getByText(/Asked the studio to send it to Julia/).waitFor();
    await tom.waitForTimeout(900);

    // And it really is only an ask: the manager answers it, and that is when
    // it moves. Cleared here so the queue is empty for the tests below.
    await matt.goto(BASE + studioHref + "/shifts");
    await matt.locator(".pubtabs .pubtab", { hasText: "Requests" }).click();
    await matt.waitForTimeout(500);
    await matt
      .locator(".setrow", { hasText: "HYROX" })
      .first()
      .getByRole("button", { name: "Approve" })
      .click();
    await matt.getByText("Approved").waitFor();
    await matt.waitForTimeout(1000);
    console.log("a shift handed on from the staff screen ok");
  }

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
    // Same list from the other door, so it wears the same faces.
    if (!(await tom.locator(".sheet .setrow .sendav").count()))
      fail("the class sheet's transfer list should wear the coaches' avatars");
  }
  await tom.locator(".sheet .setrow", { hasText: "Julia" }).click();
  // Named, then asked: the confirm says who takes it before anyone is told.
  await tom.getByRole("heading", { name: "Transfer to Julia?" }).waitFor();
  await tom.getByRole("button", { name: "Transfer to Julia" }).click();
  // With approval on, a hand-over is an ask too, and the toast says so rather
  // than telling Tom it is done.
  await tom.getByText(/Asked the studio to send it to Julia/).waitFor();
  await tom.waitForTimeout(900);
  console.log("a date offered straight to a coach ok");

  // She hears she has been asked for, not that it is hers: it is not, yet.
  await julia.goto(BASE + "/updates");
  const asked = julia.locator(".notifrow", { hasText: /asked to cover HYROX/i }).first();
  await asked.waitFor();
  // The rota still says Tom until somebody answers.
  await matt.goto(BASE + studioHref + "/manage?w=2");
  {
    const still = matt.locator(".ps-event", { hasText: "HYROX" }).first();
    await still.waitFor();
    if (/Julia/.test(await still.innerText()))
      fail("a pending hand-over reached the rota before it was approved");
  }
  // The manager says yes, and then it is hers.
  await matt.goto(BASE + studioHref + "/shifts");
  await matt.locator(".pubtabs .pubtab", { hasText: "Requests" }).click();
  await matt.waitForTimeout(400);
  await matt
    .locator(".setrow", { hasText: "handing HYROX to Julia" })
    .first()
    .getByRole("button", { name: "Approve" })
    .click();
  await matt.getByText("Approved").waitFor();
  await matt.waitForTimeout(1000);
  await julia.goto(BASE + "/updates");
  await julia.locator(".notifrow", { hasText: /You're on HYROX/ }).first().waitFor();
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
  {
    const named = await anon.locator(".ps-week .ps-ewho").allInnerTexts();
    if (named.some((t) => /Tom/.test(t)))
      fail("the gym's public week named the coach: " + named.join("|"));
  }
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
  await mem.waitForURL("**/week");

  await mem.goto(BASE + studioHref);
  await mem.locator(".ps-event", { hasText: "HYROX" }).click();
  await mem.locator(".classoverlay-nm", { hasText: "HYROX" }).waitFor();
  await mem.locator(".ovcta-save").click();
  await mem.locator(".favtoast.on").waitFor();
  await mem.goto(BASE + "/week");
  await mem.locator(".ps-enm", { hasText: "HYROX" }).waitFor();
  console.log("a member can add the gym's class ok (it lands in their plans)");

  // ---- who the row names
  //
  // A gym owns its classes, so a row built from the owner named the gym where
  // the coach chip goes and the gym again as the place, and the person you
  // followed to find the class was nowhere on it.
  //
  // Its own slot rather than one of the ones above: every coach here also has
  // a "Warm Up" of their own from signup and HYROX has a cover on it, so
  // neither can say which row was matched.
  //
  // Both sides of the gate, because the gate is the whole point. Off, the row
  // stays the gym's: whether a gym's schedule names anybody is the gym's call.
  // On, she has published the shift as hers and it already carries her name on
  // her own page, so the calendar saying it too is one fact said once.
  {
    await matt.goto(BASE + studioHref + "/manage");
    await matt.locator(".rotaday", { hasText: "Friday" }).getByRole("button", { name: "Add" }).click();
    await matt.locator("#fName").fill("Rota Naming");
    await lateSlot(matt);
    await matt.locator("#fCoach").selectOption({ label: "Julia" });
    await matt.getByRole("button", { name: "Add to the schedule" }).click();
    await matt.getByText("Added to the week").waitFor();
    await matt.waitForTimeout(700);

    await mem.goto(BASE + studioHref);
    await mem.locator(".ps-event", { hasText: "Rota Naming" }).first().click();
    await mem.locator(".classoverlay-nm", { hasText: "Rota Naming" }).waitFor();
    if (await mem.locator(".classoverlay-coach").count())
      fail("a gym's class should name nobody while its coach keeps shifts private");
    await mem.locator(".ovcta-save").click();
    await mem.locator(".favtoast.on").waitFor();

    const chip = () =>
      mem.locator(".ps-erow", { hasText: "Rota Naming" }).first().locator(".ps-ewho");
    await mem.goto(BASE + "/week");
    await mem.locator(".ps-enm", { hasText: "Rota Naming" }).first().waitFor();
    if (await chip().count()) {
      const who = await chip().innerText();
      if (/Julia/.test(who)) fail("a private shift put the coach's name on a member's week");
    }

    // Julia's own answer, and the only thing that changes. The switch lives
    // under Settings > Your page, and only once a gym has put her on
    // something, which by now it has.
    await julia.goto(BASE + "/you");
    await openSetting(julia, "Your page");
    await julia.locator(".sheet .setrow", { hasText: "Gym shifts on your page" }).click();
    await julia.waitForTimeout(900);

    await mem.goto(BASE + "/week");
    await mem.locator(".ps-enm", { hasText: "Rota Naming" }).first().waitFor();
    await chip().first().waitFor();
    const named = await chip().first().innerText();
    if (!/Julia/.test(named)) fail("her shift is public now, so the row should say so: " + named);

    // And the sheet agrees with the row it was opened from.
    await mem.locator(".ps-event", { hasText: "Rota Naming" }).first().click();
    await mem
      .locator(".classoverlay-nm", { hasText: "Rota Naming" })
      .waitFor()
      .catch(async () => {
        await mem.screenshot({ path: "/tmp/claude-0/-home-user-fittlist/f5c2d228-192a-574b-90ee-b3d90eac7295/scratchpad/shot-rota-naming.png", fullPage: true });
        const rows = await mem.locator(".ps-erow").allInnerTexts();
        fail("the row did not open its class: " + JSON.stringify(rows.slice(0, 6)));
      });
    const coachRow = mem.locator(".classoverlay-coach");
    await coachRow.waitFor();
    if (!/Julia/.test(await coachRow.innerText()))
      fail("the sheet should name whoever the row named");
    // It taps through to her, not to the studio the class is addressed under.
    const href = await coachRow.getAttribute("href");
    if (!/^\/julia/i.test(href ?? "")) fail("the coach row should open the coach: " + href);

    // Put it back, so nothing after this depends on a switch this block flipped.
    await julia.goto(BASE + "/you");
    await openSetting(julia, "Your page");
    await julia.locator(".sheet .setrow", { hasText: "Gym shifts on your page" }).click();
    await julia.waitForTimeout(900);
    console.log("a gym's row names the coach only where she shows her shifts ok");
  }
  await memCtx.close();
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
  await mem.waitForURL("**/week");
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
  await lateSlot(matt);
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

// Approval is on by default, and the point of it is that nothing a manager
// has not answered reaches a calendar.
//
// Self-contained: it builds its own slot and leaves it unassigned rather than
// borrowing a coach or a class from the tests above, which by this point have
// swapped, handed on and merged their way through both. The slot is open from
// birth, so there is nothing to give up first.
{
  await matt.goto(BASE + studioHref + "/manage?w=1");
  await matt.locator(".rotaday", { hasText: "Sunday" }).getByRole("button", { name: "Add" }).click();
  await matt.locator("#fName").waitFor();
  await matt.locator("#fName").fill("Cover Test");
  await matt.locator("#fStart").fill("11:00");
  await matt.getByRole("button", { name: "Add to the schedule" }).click();
  await matt.getByText("Added to the week").waitFor();
  await matt.waitForTimeout(900);

  // Julia asks for it. She still lists a class here, so she is a coach at the
  // studio; Tom's own class was merged into the gym earlier, which takes him
  // out of that union.
  await julia.goto(BASE + studioHref + "/shifts");
  await julia.locator(".pubtabs .pubtab", { hasText: "Open" }).click();
  await julia.waitForTimeout(500);
  const open = julia.locator(".setrow", { hasText: "Cover Test" }).first();
  await open.waitFor();
  await open.getByRole("button", { name: "Pick up" }).click();
  await julia.getByText("Asked the studio").waitFor();
  await julia.waitForTimeout(900);

  // Nothing has moved: the gym's public page does not carry her name.
  await julia.goto(BASE + studioHref);
  await julia.waitForTimeout(500);
  // Same shape, same reason: ask the chip whether anybody is named rather
  // than searching a week of prose for a first name.
  {
    const named = await julia.locator(".ps-week .ps-ewho").allInnerTexts();
    if (named.some((t) => /Julia/.test(t)))
      fail("a pending ask reached the studio's public page: " + named.join("|"));
  }

  // The manager answers, and that is the moment it becomes true.
  await matt.goto(BASE + studioHref + "/shifts");
  await matt.locator(".pubtabs .pubtab", { hasText: "Requests" }).click();
  await matt.waitForTimeout(500);
  await matt
    .locator(".setrow", { hasText: "Cover Test" })
    .first()
    .getByRole("button", { name: "Approve" })
    .click();
  await matt.getByText("Approved").waitFor();
  await matt.waitForTimeout(1200);
  await julia.goto(BASE + "/updates");
  await julia.locator(".notifrow", { hasText: /You're on Cover Test/ }).first().waitFor();
  console.log("approval holds a change off the calendars until it is answered ok");
}

await b.close();
console.log("GYM CHECKS PASSED");
