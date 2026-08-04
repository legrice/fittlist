// Activity: its own page, reached by its URL and nothing else.
//
// The feed is made of public acts by the people you follow, so the fixture is
// a coach who posts a week, a member who marks Going in public, and a second
// member who follows them both and should see each act once.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
//   node scripts/activity-smoke.mjs
import { chromium } from "playwright";
import { skipSetup } from "./lib/wizard.mjs";

const BASE = "http://localhost:3000";
const fail = (m) => { throw new Error("ACTIVITY FAIL: " + m); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

const mk = async (email, name, member) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(15000);
  await p.goto(BASE + "/");
  await p.getByRole("button", { name: "Sign up with email" }).click();
  if (member) await p.locator(".roleseg button", { hasText: "here to train" }).click();
  await p.getByPlaceholder("you@example.com").fill(email);
  await p.getByPlaceholder("Password").fill("act-pass-123");
  await p.getByRole("button", { name: "Create account" }).click();
  await p.getByRole("button", { name: "Not now" }).click().catch(() => {});
  await p.getByText("Pick your link.").waitFor();
  await p.getByPlaceholder("Your name").fill(name);
  await p.getByRole("button", { name: "Claim it" }).click();
  await skipSetup(p);
  return p;
};

// A coach who puts a week up.
const coach = await mk("erin@example.com", "Erin Clyne", false);
await coach.getByRole("heading", { name: "Your week is wide open" }).waitFor();
await coach.getByRole("button", { name: "Add your first class" }).click();
await coach.getByPlaceholder("e.g. Barbell Strength").fill("Soul Power Yoga");
for (const d of ["Mo", "We", "Fr"]) {
  await coach.getByRole("button", { name: d, exact: true }).click();
}
await coach.getByRole("button", { name: "Select or start typing a studio" }).click();
await coach.getByRole("heading", { name: "Choose a studio" }).waitFor();
await coach.getByRole("button", { name: "+ New studio" }).click();
await coach.getByPlaceholder("e.g. Palisade Barbell").fill("Asana Soul Practice");
await coach.getByPlaceholder("e.g. 501 Palisade Ave, Jersey City").fill("124 1st St, Jersey City, NJ");
await coach.getByRole("button", { name: "Add studio" }).click();
await coach.locator(".studio-sel .nm").waitFor();
await coach.locator(".publishwrap .btn").click();
await coach.waitForTimeout(900);
console.log("a coach put a week up ok");

// The heartbeat is off every shell, by Matt's call: the header carries the
// search and the bell and nothing else. Activity keeps working and keeps its
// URL; what it has no longer is a door.
{
  await coach.goto(BASE + "/app");
  await coach.locator(".caladd").waitFor();
  if (await coach.locator(".brandbar-actions .activitybtn").count())
    fail("the Activity heartbeat is back on the coach's schedule");
  await coach.goto(BASE + "/feed");
  await coach.locator(".brandbar-actions").waitFor();
  if (await coach.locator(".brandbar-actions .activitybtn").count())
    fail("the Activity heartbeat is back on Following");
}
console.log("no heartbeat on either shell ok");

// A member who marks one of them, publicly (the default).
const goer = await mk("sam@example.com", "Sam Goer", true);
await goer.goto(BASE + "/erinclyne");
await goer.locator(".ps-erow .evcard-add").first().click();
await goer.waitForTimeout(800);
console.log("a member marked going ok");

// The viewer follows both.
const me = await mk("viv@example.com", "Viv Viewer", true);
for (const who of ["erinclyne", "samgoer"]) {
  await me.goto(`${BASE}/${who}`);
  await me.locator(".profacts .followpill").waitFor();
  await me.waitForTimeout(400);
  await me.locator(".profacts .followpill").click();
  await me.locator(".profacts .followpill", { hasText: /Following|Requested/ }).waitFor();
}
console.log("followed the coach and the member ok");

// Activity is not a tab and no longer an icon: the URL is the only way in.
await me.goto(BASE + "/feed");
{
  const tabs = (await me.locator(".navtab").allInnerTexts()).map((t) => t.trim());
  if (tabs.some((t) => /activity/i.test(t)))
    fail("Activity should not be a tab: " + tabs.join("|"));
}
await me.goto(BASE + "/activity");
await me.locator(".acthead", { hasText: "Activity" }).waitFor();

// Both kinds of row, and the coach's post leads.
{
  const rows = await me.locator(".hm-lrow").allInnerTexts();
  if (rows.length < 2) fail("expected the coach's post and the going mark: " + rows.join(" | "));
  if (!/Erin/.test(rows[0])) fail("a coach's post should lead the feed: " + rows[0]);
  if (!rows.some((r) => /Sam/.test(r) && /going to/.test(r)))
    fail("the public going mark should be here: " + rows.join(" | "));
  // A weekly class is one act, not three: grouped by seriesId.
  const erin = rows.filter((r) => /Erin/.test(r));
  if (erin.length !== 1) fail("a weekly class should count once, got " + erin.length);
}
// The rule the whole social layer rests on, said where the feed is.
await me.getByText("Only public actions appear here").waitFor();
console.log("activity page ok (coach post leads, going mark follows, one row per class)");

// A personal entry never reaches it: there is no column that could make one
// public, and this is the check that says so out loud.
await goer.goto(BASE + "/week");
await goer.locator(".caladd").click();
await goer.locator(".sheet .setrow", { hasText: "going to" }).click();
await goer.getByPlaceholder("e.g. Barbell Strength").fill("Secret Physio");
await goer.getByRole("button", { name: "Mo", exact: true }).click();
await goer.locator(".publishwrap .btn").first().click();
await goer.waitForTimeout(900);
await me.goto(BASE + "/activity");
await me.locator(".acthead").waitFor();
if ((await me.locator(".hm-lrow").allInnerTexts()).some((r) => /Secret Physio/.test(r)))
  fail("a personal entry reached Activity");
console.log("personal stays private ok");

// Somebody who follows nobody gets the empty state, not a blank page.
const lonely = await mk("lon@example.com", "Lon Lonely", true);
await lonely.goto(BASE + "/activity");
await lonely.getByRole("heading", { name: "Nothing yet" }).waitFor();
await lonely.getByRole("link", { name: "Find coaches" }).waitFor();
console.log("empty state ok (says the action, not an apology)");

await b.close();
console.log("ACTIVITY CHECKS PASSED");
