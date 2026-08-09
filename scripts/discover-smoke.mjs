// Discover after the updates brief: Follow is the one relationship word,
// the This week rail is rings over the people you follow, the peek is a
// live week of coaching plus saved with the overlap marked, the filters
// are four value-showing chips, and the list is open-ended with series
// collapse. Replaces the favorites-era walk.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
//   node scripts/discover-smoke.mjs
import { chromium } from "playwright";
import { skipSetup } from "./lib/wizard.mjs";

const BASE = "http://localhost:3000";
const fail = (m) => { throw new Error("DISCOVER FAIL: " + m); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const stamp = Date.now().toString(36);

const mk = async (email, name, member) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(25000);
  await p.goto(BASE + "/");
  await p.getByRole("button", { name: "Sign up with email" }).click();
  await p.getByPlaceholder("you@example.com").fill(email);
  await p.getByPlaceholder("Password").fill("disc-pass-123");
  await p.getByRole("button", { name: "Create account" }).click();
  await p.getByRole("button", { name: "Not now" }).click().catch(() => {});
  await p.getByText("Pick your link.").waitFor();
  await p.getByPlaceholder("Your name").fill(name);
  await p.getByRole("button", { name: "Claim it" }).click();
  await skipSetup(p, "Jersey City, NJ", !member);
  if (member) await p.waitForURL("**/feed");
  return p;
};

// One coach, three Monday classes at one studio and one Tuesday class:
// weekly, so the collapse has something to collapse.
const coach = await mk(`dc${stamp}@example.com`, `Drew ${stamp.slice(-3)}`, false);
const addClass = async (nm, day, t, firstStudio) => {
  await coach.goto(BASE + "/calendar");
  await coach.locator(".wkempty-cta, .wkfab").first().click();
  await coach
    .locator(".addseg button", { hasText: /coaching/ })
    .click({ timeout: 4000 })
    .catch(() => {});
  await coach.locator(".stepline", { hasText: "Choose the studio" }).waitFor();
  if (firstStudio) {
    await coach.getByRole("button", { name: "+ New studio" }).click();
    await coach.getByPlaceholder("e.g. Palisade Barbell").fill(`Drew Gym ${stamp.slice(-3)}`);
    await coach.getByPlaceholder("e.g. 501 Palisade Ave, Jersey City").fill("1 Drew St, Jersey City NJ");
    await coach.getByRole("button", { name: "Add studio" }).click();
  } else {
    await coach.getByPlaceholder("Start typing a studio…").fill("Drew Gym");
    await coach.locator(".studio-row", { hasText: "Drew Gym" }).click();
    await coach.getByRole("button", { name: "+ New class" }).click();
  }
  await coach.getByPlaceholder("e.g. Barbell Strength").fill(nm);
  await coach.getByRole("button", { name: day, exact: true }).click();
  await coach.locator("#fStart").fill(t);
  await coach.locator(".publishwrap .btn").click();
  await coach.waitForTimeout(1200);
  await coach.locator(".sheetclose").first().click().catch(() => {});
};
await addClass("Dawn Lift", "Mo", "06:00", true);
await addClass("Noon Lift", "Mo", "12:00", false);
await addClass("Dusk Lift", "Mo", "18:00", false);
await addClass("Tuesday Flow", "Tu", "09:00", false);
console.log("coach's week up: three Mondays, one Tuesday");

// A second member, for People near you's Everyone half.
const kai = await mk(`dk${stamp}@example.com`, `Kai ${stamp.slice(-3)}`, true);
await kai.context().close();

// The member the walk belongs to.
const m = await mk(`dm${stamp}@example.com`, `Demi ${stamp.slice(-3)}`, true);
const tabs = (await m.locator(".navtab").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
if (!tabs[0].includes("Discover")) fail("Discover leads the bar: " + tabs.join("|"));

// The landing: no search bar (Search is a tab now), the teaching rail
// (following nobody), the value-showing chips, and the date tabs.
if (await m.locator(".dissearch-door").count()) fail("Home carries no search bar: Search is a tab");
await m.locator(".railbl", { hasText: "This week" }).waitFor();
await m.locator(".trayhint").waitFor();
if ((await m.locator(".trayav-ghost").count()) !== 2) fail("a bare rail gets two ghosts");
await m.locator(".trayitem", { hasText: "Your week" }).waitFor();
await m.locator(".nearlbl", { hasText: "Upcoming near you" }).waitFor();
if ((await m.locator(".fchips .catpill").count()) !== 5)
  fail("the leading Filters chip plus the four questions");
if (await m.locator(".fchip-clear").count()) fail("Clear only appears once something is set");

// The leading chip opens everything at once and stays open while you set
// it; picking inside marks the chip with the count.
await m.locator(".fchip-lead").click();
await m.locator(".fsheet h2", { hasText: "Filters" }).waitFor();
await m.locator(".fsec-h", { hasText: "Time of day" }).waitFor();
await m.locator(".fopt", { hasText: "Morning, before 11" }).click();
if (!(await m.locator(".fsheet").count())) fail("the everything sheet stays open on a pick");
await m.locator(".fsheet-foot .btn.si", { hasText: "Done" }).click();
await m.locator(".fchip-lead.on", { hasText: "1" }).waitFor();
await m.locator(".fchip-clear").click();
console.log("the leading chip opens all filters and wears the count");

// The dates run left to right again, by Matt's call, leading with Today.
await m.locator(".daytabs").waitFor();
if ((await m.locator(".daytab").first().innerText()) !== "Today") fail("the rail leads with Today");
console.log("the landing: door, rail, chips, date tabs");

// Walk the rail to the day that holds the thing we're looking for: the
// suite runs on any weekday, so which tab is which is not ours to hardcode.
const pickDay = async (page, needle) => {
  const tabs = page.locator(".daytab");
  const n = await tabs.count();
  for (let i = 0; i < n; i++) {
    await tabs.nth(i).click();
    if (await needle(page)) return;
  }
  fail("no day tab shows what the suite wants");
};

// A busy Monday lists every class, and each row's one control is Save in
// the corner: no dots menu on Discover, by Matt's call.
await pickDay(m, (p) => p.getByText("Dawn Lift").count());
for (const nm of ["Dawn Lift", "Noon Lift", "Dusk Lift"])
  if (!(await m.locator(".clline-nm", { hasText: nm }).count())) fail(nm + " must list itself");
if (await m.locator(".clmore").count()) fail("no dots menu on Discover rows");
const firstSave = m.locator(".rowsave").first();
if (!(await firstSave.count())) fail("every row wears Save in the corner");
await firstSave.click();
await m.locator(".rowsave.on", { hasText: "Saved" }).first().waitFor();
await m.locator(".rowsave.on").first().click();
await m.waitForFunction(() => !document.querySelector(".rowsave.on"), null, { timeout: 10000 });
console.log("the corner Save fills and empties in place");

// The time chip: value-showing, and Evening leaves only the six o'clock.
await m.locator(".fchips .catpill", { hasText: "Any time" }).click();
await m.locator(".fopt", { hasText: "Evening, after 4" }).click();
await m.locator(".clline-nm", { hasText: "Dusk Lift" }).waitFor();
if (await m.locator(".clline-nm", { hasText: "Dawn Lift" }).count()) fail("Evening drops the 6am");
if (!(await m.locator(".fchips .catpill.on", { hasText: "Evening" }).count()))
  fail("the chip says its value and inverts");
await m.locator(".fchip-clear").click();
await m.locator(".clline-nm", { hasText: "Dawn Lift" }).waitFor();
console.log("the time chip narrows and Clear resets");

// The places sheet stays open while you tick.
await m.locator(".fchips .catpill", { hasText: "All places" }).click();
await m.locator(".fopt", { hasText: "Drew Gym" }).click();
if (!(await m.locator(".fsheet").count())) fail("the places sheet stays open to multi-select");
await m.locator(".fsheet .publishwrap .btn", { hasText: "Done" }).click();
if (!(await m.locator(".fchips .catpill.on", { hasText: "Drew Gym" }).count()))
  fail("the places chip names the pick");
await m.locator(".fchip-clear").click();
console.log("the places chip multi-selects with the sheet open");

// The class peek: Follow (no star), and Save in the footer.
await m.locator(".clline-nm", { hasText: "Dusk Lift" }).click();
await m.locator(".peekfollow", { hasText: "Follow" }).waitFor();
if (await m.locator(".peekstar").count()) fail("no stars anywhere");
await m.locator(".peekfollow").click();
await m.locator(".peekfollow.on", { hasText: "Following" }).waitFor();
await m.locator(".clsfull-btn.save", { hasText: "Save" }).click();
await m.locator(".clsfull-btn.save.on", { hasText: "Saved" }).waitFor();
await m.locator(".clsfull-x").click();
console.log("followed and saved from the class");

// The rail: Drew's circle wears the fresh ring; Kai, quiet, is not on it.
await m.goto(BASE + "/feed");
await m.locator(".trayitem", { hasText: "Drew" }).waitFor();
if (!(await m.locator(".trayav-ring:not(.seen)").count())) fail("an unseen week rings in brand");
if (await m.locator(".trayitem", { hasText: "Kai" }).count()) fail("a week never touched stays off the rail");
if (await m.locator(".trayitem-next").count()) fail("no captions under the circles");
console.log("the ring is lit before the peek");

// The peek: Week of, the overlap said at the top, Coaching tags, the
// You-saved-this-too marker, and the ribbon footer.
await m.locator(".trayitem", { hasText: "Drew" }).click();
await m.locator(".peekhead-wk", { hasText: "Week of" }).waitFor();
await m.locator(".peeksheet .peekfollow.on", { hasText: "Following" }).waitFor();
await m.locator(".peeklead", { hasText: "You have 1 of these on your week." }).waitFor();
if (!(await m.locator(".peektag", { hasText: "Coaching" }).count())) fail("coached rows tag Coaching");
if (!(await m.locator(".peektag-you", { hasText: "You saved this too" }).count()))
  fail("the overlap marker draws on the saved row");
await m.locator(".peekfoot", { hasText: "Ribbon anything here" }).waitFor();
await m.locator(".peekadd:not(.on)").first().click();
await m.locator(".peektag-you").nth(1).waitFor();
await m.locator(".peekclose").click();
console.log("the peek: live rows, tags, the overlap");

// Seen: the ring goes grey once the week has been opened.
await m.locator(".trayav-ring.seen").waitFor({ timeout: 15000 });
console.log("the ring goes out on the peek, not the close");

// People near you: the segment, the Coach tag and next time, Follow rows.
await m.locator(".trayitem", { hasText: "Add" }).click();
await m.locator(".dissheet h2", { hasText: "People near you" }).waitFor();
const drewRow = m.locator(".nearrow", { hasText: "Drew" });
await drewRow.waitFor();
if (!(await drewRow.locator(".nearrow-tag", { hasText: "Coach" }).count())) fail("coach rows tag Coach");
if (!(await drewRow.locator(".nearrow-sub", { hasText: "next" }).count()))
  fail("coach rows say their next class");
await drewRow.locator(".peekfollow.on", { hasText: "Following" }).waitFor();
const kaiRow = m.locator(".nearrow", { hasText: "Kai" });
await kaiRow.waitFor();
if (await kaiRow.locator(".nearrow-tag").count()) fail("member rows carry no tag");
await m.locator(".whoseg button", { hasText: "Coaches only" }).click();
if (await m.locator(".nearrow", { hasText: "Kai" }).count()) fail("Coaches only hides members");
await m.locator(".whoseg button", { hasText: "Everyone" }).click();
await kaiRow.locator(".peekfollow", { hasText: "Follow" }).click();
await kaiRow.locator(".peekfollow.on", { hasText: "Following" }).waitFor();
console.log("People near you: segment, tags, Follow on every row");

await b.close();
console.log("ALL DISCOVER CHECKS PASSED");
