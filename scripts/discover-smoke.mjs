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
import { existsSync, readFileSync } from "node:fs";
import { skipSetup } from "./lib/wizard.mjs";

const BASE = "http://localhost:3000";
const SERVER_LOG = process.env.SMOKE_SERVER_LOG ?? "server.log";
const fail = (m) => { throw new Error("DISCOVER FAIL: " + m); };
const lastMagic = () => {
  const matches = [...readFileSync(SERVER_LOG, "utf8").matchAll(/http:\/\/localhost:3000\/auth\/magic\?token=[a-f0-9]{64}/g)];
  if (!matches.length) fail("the local mailer did not print a sign-up link");
  return matches.at(-1)[0];
};
const dismissPasswordPrompt = async (page, timeout = 5000) => {
  const sheet = page.locator(".setpw-sheet");
  if (!(await sheet.waitFor({ timeout }).then(() => true).catch(() => false))) return;
  await sheet.locator(".confirm-keep", { hasText: "Not now" }).click();
  await sheet.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
};
const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH
  ?? (existsSync("/opt/pw-browsers/chromium")
    ? "/opt/pw-browsers/chromium"
    : existsSync(macChrome) ? macChrome : undefined);
const b = await chromium.launch(chromiumPath ? { executablePath: chromiumPath } : {});
const stamp = Date.now().toString(36);

const mk = async (email, name, member) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(25000);
  await p.goto(BASE + "/");
  while (await p.getByRole("button", { name: "Continue", exact: true }).count()) {
    await p.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await p.getByRole("button", { name: "Sign up", exact: true }).click();
  await p.getByRole("heading", { name: "Sign up with email" }).waitFor();
  await p.getByPlaceholder("you@example.com").fill(email);
  await p.getByRole("button", { name: "Email sign-up link" }).click();
  await p.getByText("Check your inbox.").waitFor();
  await p.goto(lastMagic());
  await p.getByRole("button", { name: "Continue securely" }).click();
  await p.getByText("Pick your link.").waitFor();
  await p.getByPlaceholder("Your name").fill(name);
  await p.getByRole("button", { name: "Claim it" }).click();
  await skipSetup(p, "Jersey City, NJ", !member);
  if (member) await p.waitForURL("**/feed");
  await dismissPasswordPrompt(p, 10000);
  return p;
};

// One coach, three Monday classes at one studio and one Tuesday class:
// weekly, so the collapse has something to collapse.
const coach = await mk(`dc${stamp}@example.com`, `Drew ${stamp.slice(-3)}`, false);
const studioName = `Drew Gym ${stamp.slice(-3)}`;
const addClass = async (nm, day, t, firstStudio, rsvp = false) => {
  await coach.goto(BASE + "/calendar");
  await dismissPasswordPrompt(coach);
  await coach.locator(".calendar-empty-actions .btn.si, .calendar-bottom-add").first().click();
  await coach.locator(".addweek-option-coaching", { hasText: "Teaching a class" }).click();
  await coach.locator(".addrole-continue").click();
  await coach.locator(".addrole-new-class, .stepline").first().waitFor();
  if (await coach.locator(".addrole-new-class").isVisible().catch(() => false)) {
    await coach.locator(".addrole-new-class").click();
  }
  await coach.locator(".stepline", { hasText: "Choose the place" }).waitFor();
  if (firstStudio) {
    await coach.getByRole("button", { name: "+ New place" }).click();
    await coach.locator("#nsName").fill(studioName);
    await coach.locator("#nsAddr").fill("1 Drew St, Jersey City NJ");
    await coach.getByRole("button", { name: "Add place" }).click();
  } else {
    await coach.getByPlaceholder("Search places…").fill(studioName);
    await coach.locator(".studio-row", { hasText: studioName }).click();
    await coach.getByRole("button", { name: "+ New class" }).click();
  }
  await coach.getByPlaceholder("e.g. Barbell Strength").fill(nm);
  await coach.getByRole("button", { name: day, exact: true }).click();
  await coach.locator("#fStart").fill(t);
  if (rsvp) {
    await coach.locator(".setrow", { hasText: "Ask people to RSVP" }).click();
  }
  await coach.locator(".publishwrap .btn").click();
  await coach.waitForTimeout(1200);
  await coach.locator(".sheetclose").first().click({ timeout: 1000 }).catch(() => {});
};
await addClass("Dawn Lift", "Mo", "06:00", true);
await addClass("Noon Lift", "Mo", "12:00", false, true);
await addClass("Dusk Lift", "Mo", "18:00", false);
await addClass("Tuesday Flow", "Tu", "09:00", false);
console.log("coach's week up: three Mondays, one Tuesday");

// A second member, for People near you's Everyone half.
const kai = await mk(`dk${stamp}@example.com`, `Kai ${stamp.slice(-3)}`, true);
await kai.context().close();

// The member the walk belongs to.
const m = await mk(`dm${stamp}@example.com`, `Demi ${stamp.slice(-3)}`, true);

const checkSavedShare = async () => {
  // A normal save stays light, then Share opens the finished image without
  // dismissing the class. The image must describe the exact occurrence that
  // was saved, not the series' next date.
  await m.goto(`${BASE}/drew${stamp.slice(-3)}`);
  const follow = m.locator(".profacts .followpill").first();
  if ((await follow.innerText()).trim() === "Follow") {
    await follow.click();
    await follow.filter({ hasText: "Following" }).waitFor();
  }
  const duskRow = m.locator(".profile-calendar-list .clline", { hasText: "Dusk Lift" }).first();
  await duskRow.waitFor();
  const duskIso = await duskRow.getAttribute("data-d");
  if (!duskIso || !/^\d{4}-\d{2}-\d{2}$/.test(duskIso)) fail("the class row carries its occurrence date");
  await duskRow.click();
  await m.locator(".clsfull").waitFor();
  await m.locator(".clsfull-btn.save", { hasText: "Save" }).click();
  await m.locator(".clsfull-btn.save.on", { hasText: "Saved" }).waitFor();
  await m.locator(".postsave-toast", { hasText: "Saved to your week" }).waitFor();
  if (await m.locator(".postsave-sheet").count()) fail("an ordinary save should not force open sharing");
  const classCardRequest = m.waitForRequest((request) => request.url().includes("/api/card/class/"));
  await m.locator(".postsave-toast").getByRole("button", { name: "Share" }).click();
  const requestedCard = new URL((await classCardRequest).url());
  if (requestedCard.searchParams.get("d") !== duskIso)
    fail("the share image should use the exact saved occurrence");
  await m.locator(".postsave-sheet").waitFor();
  await m.waitForFunction(() => {
    const image = document.querySelector(".postsave-preview img");
    return image instanceof HTMLImageElement && image.naturalWidth === 1080 && image.naturalHeight === 1080;
  });
  await m.locator(".postsave-sheet .btn", { hasText: "Share this class" }).waitFor();
  await m.locator('.postsave-week[href="/share"]', { hasText: "Share my whole week" }).waitFor();
  await m.locator('.postsave-sheet[data-groups-ready="true"]').waitFor();
  if (await m.locator(".postsave-row", { hasText: "Add to a group" }).count())
    fail("people without a managed group should not get a group action");
  if (process.env.SMOKE_SCREENSHOT) {
    await m.screenshot({ path: process.env.SMOKE_SCREENSHOT });
  }
  await m.locator(".postsave-sheet .sheetclose").click();
  await m.locator(".postsave-sheet").waitFor({ state: "detached" });
  await m.locator(".clsfull-btn.save.on", { hasText: "Saved" }).waitFor();
  await m.locator(".clsfull-x").click();

  // Managed groups are an optional hand-off, visible only when it is honest.
  const groupName = `Monday Crew ${stamp.slice(-3)}`;
  await m.goto(`${BASE}/saved`);
  await m.locator(".savedsection-groups .youfav-add").click();
  await m.getByPlaceholder("Saturday run crew").fill(groupName);
  await m.locator(".create-group-submit", { hasText: "Continue" }).click();
  await m.locator(".create-group-purpose").waitFor();
  await m.locator(".create-group-submit", { hasText: "Continue" }).click();
  await m.locator(".create-group-visibility").waitFor();
  await m.locator(".create-group-submit", { hasText: "Create group" }).click();
  await m.waitForURL(/\/g\//);

  await m.goto(`${BASE}/drew${stamp.slice(-3)}`);
  const savedDusk = m.locator(".profile-calendar-list .clline", { hasText: "Dusk Lift" }).first();
  await savedDusk.click();
  await m.locator(".clsfull-btn.save.on", { hasText: "Saved" }).click();
  await m.locator(".clsfull-btn.save", { hasText: "Save" }).click();
  await m.locator(".postsave-toast").getByRole("button", { name: "Share" }).click();
  await m.locator('.postsave-sheet[data-groups-ready="true"]').waitFor();
  await m.locator(".postsave-row", { hasText: "Add to a group you manage" }).click();
  const groupChoice = m.locator(".postsave-groups button", { hasText: groupName });
  await groupChoice.click();
  await groupChoice.getByText("Added", { exact: true }).waitFor();
  await m.locator(".postsave-sheet .sheetclose").click();
  await m.locator(".clsfull-x").click();

  // RSVP is a stronger commitment, so this branch opens the same focused
  // share moment immediately after the successful save.
  const noonRow = m.locator(".profile-calendar-list .clline", { hasText: "Noon Lift" }).first();
  await noonRow.click();
  await m.locator(".clspeek-rsvpnote").waitFor();
  await m.locator(".clsfull-btn.save", { hasText: "Save" }).click();
  await m.locator(".postsave-sheet", { hasText: "RSVP sent" }).waitFor();
  if (await m.locator(".postsave-toast").count()) fail("RSVP should open the focused share moment directly");
  await m.locator(".postsave-sheet .sheetclose").click();
  await m.locator(".clsfull-btn.save.on", { hasText: "Saved" }).click();
  await m.locator(".clsfull-btn.save", { hasText: "Save" }).waitFor();
  await m.locator(".clsfull-x").click();
  console.log("normal save, exact image, managed group, and RSVP share paths passed");
};

if (process.env.SHARE_ONLY === "1") {
  await checkSavedShare();
  await b.close();
  process.exit(0);
}

const tabs = (await m.locator(".navtab").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
if (!tabs[0].includes("Home")) fail("Home leads the bar: " + tabs.join("|"));

// The landing: one stable utility order in the header, then the teaching rail
// (following nobody), and the three rails.
if (await m.locator(".dissearch-door").count()) fail("Home's search bar came off");
{
  const actions = await m.locator(".brandbar-actions > [aria-label]").evaluateAll((els) =>
    els.map((el) => el.getAttribute("aria-label")),
  );
  if (actions.join("|") !== "Search|Notifications|Settings")
    fail("header should be Search, Notifications, Settings: " + actions.join("|"));
}
await m.locator(".railbl", { hasText: "This week" }).waitFor();
await m.locator(".trayhint").waitFor();
if ((await m.locator(".trayav-ghost").count()) !== 2) fail("a bare rail gets two ghosts");
// The leading circle is your own face and the word You, by Matt's call.
await m.locator(".trayitem", { hasText: "You" }).first().waitFor();
if (!(await m.locator(".trayav-you .trayav-ini, .trayav-you img").count()))
  fail("the You circle wears the viewer's own face");

// Upcoming near you is the containerless list with the date rail and
// the filters, back by Matt's call: one day at a time behind the tabs,
// the four value-showing chips over them.
await m.locator(".nearlbl", { hasText: "Upcoming near you" }).waitFor();
if ((await m.locator(".fchips .catpill").count()) !== 5)
  fail("the leading Filters chip plus the four questions");
if (await m.locator(".fchip-clear").count()) fail("Clear only appears once something is set");
await m.locator(".daytabs .daytab", { hasText: "Today" }).waitFor();
await m.locator(".disflat .clline-nm").first().waitFor();
console.log("the landing: corner search, the faces, the date rail and the chips");

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

// The time chip: value-showing, and Evening narrows the selected day.
await m.locator(".daytabs .daytab", { hasText: /Mon|Today/ }).first().click();
await m.locator(".fchips .catpill", { hasText: "Any time" }).click();
await m.locator(".fopt", { hasText: "Evening, after 4" }).click();
await m.locator(".clline-nm", { hasText: "Dusk Lift" }).first().waitFor();
if (await m.locator(".clline-nm", { hasText: "Dawn Lift" }).count()) fail("Evening drops the 6am");
if (!(await m.locator(".fchips .catpill.on", { hasText: "Evening" }).count()))
  fail("the chip says its value and inverts");
await m.locator(".fchip-clear").click();
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

// The ribbon on a row saves in place. No toast, by Matt's call: the save
// lights your own circle at the top of the rail instead, brand ring plus
// a New badge on your face.
const firstSave = m.locator(".rowsave").first();
if (!(await firstSave.count())) fail("every row wears Save across from the coach line");
await firstSave.click();
await m.locator(".rowsave.on", { hasText: "Saved" }).first().waitFor();
if (await m.locator(".toast.on", { hasText: "Saved" }).count())
  fail("a save lights the ring, never toasts, by Matt's call");
await m.locator(".trayav-you.trayav-ring").waitFor();
await m.locator(".younew", { hasText: "New" }).waitFor();
await m.locator(".rowsave.on").first().click();
await m.waitForFunction(() => !document.querySelector(".rowsave.on"), null, {
  timeout: 10000,
});
console.log("the row ribbon fills in place and lights the You ring");

// Old rail links may still carry a segment, but Search has one meaning now:
// coaches. The legacy query must fall back cleanly rather than revive a
// Classes or Studios segment.
await m.locator(".nearlbl", { hasText: "Local studios" }).waitFor();
await m.locator(".strail-item", { hasText: "Drew Gym" }).first().waitFor();
await m.locator(".nearlbl", { hasText: "Find friends" }).waitFor();
const drewNear = m.locator(".ctrail-item", { hasText: "Drew" }).first();
await drewNear.locator(".ctrail-fl", { hasText: "Follow" }).waitFor();
if ((await m.locator(".nearhead-go").count()) !== 3) fail("three rails, three arrows");
await m.locator('.nearhead-go[href="/search?seg=classes"]').click();
await m.waitForURL(/\/search\?seg=classes/);
await m.locator(".srchhead", { hasText: "Coaches" }).first().waitFor();
if (await m.locator(".srchseg, .disrow-studio, .callist").count())
  fail("Search should stay coaches-only even from an old segment link");
await m.goBack();
// The search page draws day bands too now, so wait for Home itself.
await m.waitForURL(/\/feed/);
await m.locator(".trayav-you").waitFor();
await m.locator(".disflat .clline-nm").first().waitFor();
console.log("the rails under the schedule, each arrow landing on its segment");

await checkSavedShare();

// The rail: Drew's circle wears the fresh ring; Kai, quiet, is not on it.
await m.goto(BASE + "/feed");
await m.locator(".trayitem", { hasText: "Drew" }).waitFor();
if (!(await m.locator(".trayav-ring:not(.seen)").count())) fail("an unseen week rings in brand");
if (await m.locator(".trayitem", { hasText: "Kai" }).count()) fail("a week never touched stays off the rail");
if (await m.locator(".trayitem-next").count()) fail("no captions under the circles");
console.log("the ring is lit before the peek");

// The peek: the stacked head (the name clear of the close row, View
// profile and Following under the face, no Week of line and no overlap
// count), Coaching tags, the You-saved-this-too marker, the ribbon footer.
await m.locator(".trayitem", { hasText: "Drew" }).click();
await m.locator(".peekhead-stack .peekhead-nm", { hasText: "Drew" }).waitFor();
if (await m.locator(".peekhead-wk").count()) fail("the Week of line came off, by Matt's call");
if (await m.locator(".peeklead").count()) fail("the overlap count came off, by Matt's call");
await m.locator(".peekacts .peekview", { hasText: "View profile" }).waitFor();
await m.locator(".peekacts .peekfollow.on", { hasText: "Following" }).waitFor();
if (!(await m.locator(".peektag", { hasText: "Coaching" }).count())) fail("coached rows tag Coaching");
if (!(await m.locator(".peektag-you", { hasText: "You saved this too" }).count()))
  fail("the overlap marker draws on the saved row");
await m.locator(".peekfoot", { hasText: "Ribbon anything here" }).waitFor();
await m.locator(".peekadd:not(.on)").first().click();
await m.locator(".peektag-you").nth(1).waitFor();
await m.locator(".peekclose").click();
console.log("the peek: live rows, tags, the overlap");

// Seen: the ring goes grey once the week has been opened. The repaint
// rides router.refresh(), which under a loaded machine sometimes lands
// late; a cold reload separates a slow repaint (tolerated, logged) from
// peekedAt never landing (a real failure).
try {
  await m.locator(".trayav-ring.seen").waitFor({ timeout: 15000 });
} catch {
  await m.goto(BASE + "/feed");
  await m.locator(".trayav-ring.seen").waitFor({ timeout: 15000 });
  console.log("(the seen ring needed a reload; refresh repaint was slow)");
}
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

// Manage belongs to the coach rail, not every legacy follow relationship.
// Drew is a coach and stays; Kai is a member and must not appear. The screen
// only offers unfollow, never the Followers page's remove/block action.
await m.goto(BASE + "/feed");
await m.locator(".following-manage").click();
await m.waitForURL(/\/following\?from=feed/);
await m.getByRole("heading", { name: "Manage coaches" }).waitFor();
await m.locator(".disrow", { hasText: "Drew" }).waitFor();
if (await m.locator(".disrow", { hasText: "Kai" }).count()) fail("Manage included a member");
if (await m.locator(".disblock").count()) fail("Manage exposed follower-removal controls");
await m.locator(".folback .evback").click();
await m.waitForURL(/\/feed/);
console.log("Manage is the coach-only list behind Following");

// The lit ring is a door: tapping You lands on the Share screen, the
// first landing explains it once with Continue, and arriving is what
// puts the ring out. The About block ends the scroll, and the page
// behind it carries the Contribute sheet.
await m.goto(BASE + "/feed");
await m.locator(".disflat .clline-nm").first().waitFor();
// Today's rows are all saved by this point in the walk; the tabs show one
// day at a time, so step to tomorrow for an unsaved ribbon.
await m.locator(".daytabs .daytab").nth(1).click();
await m.locator(".rowsave:not(.on)").first().click();
await m.locator(".trayav-you.trayav-ring").waitFor();
await m.locator(".trayitem", { hasText: "You" }).first().click();
await m.waitForURL(/\/membershare/);
await m.locator(".shareintro h2", { hasText: "Your week lives here" }).waitFor();
{
  const intro = (await m.locator(".shareintro .lead").innerText()).trim();
  if (!intro.includes("Share it to your story") || /QR code|\blink\b/i.test(intro))
    fail("the Share intro should describe the image workflow only: " + intro);
}
await m.locator(".shareintro .btn", { hasText: "Continue" }).click();
if (await m.locator(".shareintro").count()) fail("Continue closes the intro");
await m.goto(BASE + "/feed");
await m.locator(".disflat .clline-nm").first().waitFor();
if (await m.locator(".younew").count()) fail("arriving on the Share screen puts the ring out");
await m.locator(".abouthome-go", { hasText: "About FittList" }).click();
await m.waitForURL(/\/about/);
await m.locator(".aboutpage h1", { hasText: "public record" }).first().waitFor();
await m.locator(".contribute-cta", { hasText: "Contribute" }).click();
await m.locator(".contribsheet .setrow", { hasText: "Add a class" }).waitFor();
await m.locator(".contribsheet .setrow", { hasText: "Add a studio" }).waitFor();
await m.locator(".contribsheet .setrow", { hasText: "Share fittlist with a coach" }).waitFor();
await m.locator(".contribsheet .sheetclose").click();
console.log("the ring is the door: Share intro, then out; About and Contribute stand");

// The saved class is real: it sits on the member's own week.
await m.goto(BASE + "/week");
await m.locator(".clline[data-cid]").first().waitFor();
console.log("the save landed on the calendar");

await b.close();
console.log("ALL DISCOVER CHECKS PASSED");
