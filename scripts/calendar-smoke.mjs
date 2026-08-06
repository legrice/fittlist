// A coach's own calendar: the week stepper, the two floating controls, and the
// sheet a class opens into. This is the screen the whole build is named after
// (build a calendar, share a calendar, follow a calendar), and it had no suite
// at all: every check on it was riding along inside following-smoke's fixture
// setup, which only ever proved a class could be published.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
//   node scripts/calendar-smoke.mjs
import { chromium } from "playwright";
import { skipSetup } from "./lib/wizard.mjs";
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
await skipSetup(p);

// An empty calendar carries its own CTA and nothing else. Neither floating
// control is drawn: a plus beside the CTA is one button explaining the other,
// and a poster of an empty week is the app talking to itself.
await p.goto(BASE + "/calendar");
await p.locator(".wkempty-t", { hasText: "Your week is empty" }).waitFor();
if (await p.locator(".wkfab").count()) fail("no plus on an empty calendar");
if (await p.locator(".wkshare").count()) fail("no Share on an empty calendar");
console.log("an empty calendar is its own CTA, and carries neither floating control");

const add = async (nm, day, t, studio) => {
  await p.goto(BASE + "/calendar");
  await p.locator(".wkempty-cta, .wkfab").first().click();
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
await p.locator(".wkrow").first().waitFor();

// The two floating controls, in the two bottom corners. Add is the loud one
// in the brand colour; Share is white with the sparkle carrying the colour,
// and it wears its word because a sparkle on its own is a decoration.
{
  if (!(await p.locator(".wkfab").count())) fail("the plus should be back once there is a week");
  const share = p.locator(".wkshare");
  if (!(await share.count())) fail("Share should sit across from Add");
  const word = (await share.innerText()).trim();
  const href = await share.getAttribute("href");
  console.log("share pill:", word, "->", href);
  if (word !== "Share") fail("the Share pill wears its word: " + word);
  if (href !== "/share") fail("Share opens the composer, got " + href);
  const box = await share.boundingBox();
  const fab = await p.locator(".wkfab").boundingBox();
  if (!(box.x < fab.x)) fail("Share is the left corner and Add the right");
  if (Math.abs(box.y + box.height - (fab.y + fab.height)) > 6)
    fail("the two should sit on one line");
}
await p.screenshot({ path: (process.env.SMOKE_OUT ?? ".") + "/shot-cal-week.png" });

// The stepper walks three weeks and stops, greyed at both ends rather than
// disappearing: a control that vanishes moves the one beside it under a thumb.
{
  const back = p.locator(".wkarrow").first();
  const fwd = p.locator(".wkarrow").last();
  if (!(await back.isDisabled())) fail("there is no week before this one");
  const first = (await p.locator(".wkhead-range").innerText()).trim();
  await fwd.click();
  await fwd.click();
  const third = (await p.locator(".wkhead-range").innerText()).trim();
  console.log("stepper:", first, "->", third);
  if (first === third) fail("the arrow should move the week");
  if (!(await fwd.isDisabled())) fail("three weeks is the whole range");
  await back.click();
  await back.click();
  if ((await p.locator(".wkhead-range").innerText()).trim() !== first)
    fail("walking back should land where it started");
}

// Your own class: date, time and studio, no by-line (this sheet is yours), and
// the three things you can do with it.
await p.locator(".wkrow").first().click();
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
const before = await p.locator(".wkrow").count();
await p.locator(".clspeek-btn", { hasText: "Cancel class" }).click();
await p.locator(".confirmsheet").waitFor();
await p.locator(".confirmsheet .btn.si").click();
// The sheet closes, then the week catches up on a refresh: wait for the row
// to actually go rather than for a stopwatch.
await p.locator(".wkrow").nth(before - 1).waitFor({ state: "detached", timeout: 15000 });
{
  const after = await p.locator(".wkrow").count();
  console.log("cancelled one date:", before, "->", after);
  if (after !== before - 1) fail("one date off, not " + (before - after));
}

// Deleting the whole thing takes every date of it.
await p.locator(".wkrow").first().click();
await p.locator(".clspeek").waitFor();
await p.waitForTimeout(400);
const name = (await p.locator(".clspeek-nm").innerText()).trim();
await p.locator(".clspeek-del").click();
await p.locator(".confirmsheet").waitFor();
await p.locator(".confirmsheet .btn.si").click();
await p.locator(".wkrow-nm", { hasText: name }).waitFor({ state: "detached", timeout: 15000 });
{
  const left = (await p.locator(".wkrow-nm").allInnerTexts()).map((t) => t.trim());
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
  const names = (await p.locator(".pub .wkrow-nm").allInnerTexts()).map((t) => t.trim());
  console.log("profile rows:", [...new Set(names)].join(" | "));
  if (!names.length) fail("the profile should draw the calendar's rows");
  if (await p.locator(".pub .ps-event").count()) fail("the old card row should be gone");
}
await p.locator(".profgear").click();
await p.waitForURL(/\/settings/);
await p.locator(".acctstats .acctstat", { hasText: "Followers" }).waitFor();
console.log("Profile opens your page, and the gear on it opens settings");

// The magnifier in the header opens the same directory sheet Following's
// button does: one act, one drawing of it, wherever you are standing.
await p.goto(BASE + "/calendar");
await p.locator(".brandbar-actions .iconbtn").first().click();
await p.locator(".dissheet").waitFor();
if (!p.url().endsWith("/calendar")) fail("the header's find should not navigate");
await p.locator(".dissheet .sheetclose").click();
await p.locator(".dissheet").waitFor({ state: "detached", timeout: 10000 });
console.log("the header's magnifier opens the directory over the calendar");

await b.close();
console.log("ALL CALENDAR CHECKS PASSED");
