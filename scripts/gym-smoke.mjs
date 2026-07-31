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
import { skipSetup } from "./lib/wizard.mjs";
const BASE = "http://localhost:3000";
const fail = (m) => { throw new Error("GYM FAIL: " + m); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

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
    await p.getByRole("heading", { name: "Your week is empty" }).waitFor();
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
await matt.getByRole("link", { name: "The schedule" }).click();
await matt.waitForURL("**/manage");
await matt.locator(".admintop h1").waitFor();

// add a class with nobody on it
await matt.locator(".rotaday", { hasText: "Thursday" }).getByRole("button", { name: "Add" }).click();
await matt.getByPlaceholder("e.g. Guns, Buns, and Lungs").fill("HYROX");
await matt.locator("#rotaTime").fill("07:00");
await matt.getByRole("button", { name: "Add it" }).click();
await matt.getByText("Added to the week").waitFor();
await matt.waitForTimeout(600);
const openRow = matt.locator(".rotarow.rotaopen", { hasText: "HYROX" });
await openRow.waitFor();
if (!(await openRow.innerText()).includes("Nobody on it yet"))
  fail("an unassigned slot should say so");
console.log("open slot ok (added, nobody on it)");

// now put Tom on it
await openRow.click();
await matt.getByRole("heading", { name: "This class" }).waitFor();
await matt.locator("#rotaCoach").selectOption({ label: "Tom" });
await matt.getByRole("button", { name: "Save" }).click();
await matt.getByText("Saved").waitFor();
await matt.waitForTimeout(600);
const filled = matt.locator(".rotarow", { hasText: "HYROX" });
if (!(await filled.innerText()).includes("Tom")) fail("the row should name the coach");
if (await matt.locator(".rotarow.rotaopen", { hasText: "HYROX" }).count())
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

// Julia, the other manager, sees the same rota
await julia.goto(BASE + studioHref + "/manage");
await julia.locator(".rotarow", { hasText: "HYROX" }).waitFor();
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
