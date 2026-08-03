// What happens to a Going mark when the coach changes their mind.
//
// Three things that all live on the same code path: an edit must keep the
// marks, a delete must be possible at all (a mark points at the class row, so
// the delete used to fail on the foreign key), and whoever was coming has to
// be told. Plus the two things built alongside it: the week as pasteable text,
// and a member's own calendar feed.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
//   node scripts/going-smoke.mjs
import { chromium } from "playwright";
import { skipSetup } from "./lib/wizard.mjs";
const BASE = "http://localhost:3000";
const OUT = process.env.SMOKE_OUT ?? ".";
const fail = (m) => { throw new Error("GOING FAIL: " + m); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

const c1 = await b.newContext({ viewport: { width: 390, height: 844 } });
const co = await c1.newPage();
co.setDefaultTimeout(15000);
await co.goto(BASE + "/");
await co.getByRole("button", { name: "Sign up with email" }).click();
await co.getByPlaceholder("you@example.com").fill("coach@example.com");
await co.getByPlaceholder("Password").fill("coach-pass-123");
await co.getByRole("button", { name: "Create account" }).click();
await co.getByRole("button", { name: "Not now" }).click().catch(() => {});
await co.getByText("Pick your link.").waitFor();
await co.getByPlaceholder("Your name").fill("Carina");
await co.getByRole("button", { name: "Claim it" }).click();
await skipSetup(co);
await co.getByRole("button", { name: "Add your first class" }).click();
await co.getByPlaceholder("e.g. Barbell Strength").fill("HYROX");
for (const d of ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]) {
  await co.getByRole("button", { name: d, exact: true }).click();
}
await co.getByRole("button", { name: "Select or start typing a studio" }).click();
await co.getByRole("button", { name: "+ New studio" }).click();
await co.getByPlaceholder("e.g. Palisade Barbell").fill("Ironbound");
await co.getByPlaceholder("e.g. 501 Palisade Ave, Jersey City").fill("1 Way, Newark NJ");
await co.getByRole("button", { name: "Add studio" }).click();

// The just-published share sheet rides every brand new public class now.
// Close it when it appears so the flow underneath can carry on.
const closeLive = async (pg) => {
  const sheet = pg.locator(".sheet", { hasText: "Your class is live" });
  try { await sheet.waitFor({ timeout: 4000 }); } catch { return; }
  await sheet.locator(".sheetclose").click();
  await pg.waitForFunction(() => !document.querySelector(".sheet-scrim"));
};
await co.locator(".publishwrap .btn").click();
await co.waitForTimeout(900);
await closeLive(co);

// a member follows and marks Going
const c2 = await b.newContext({ viewport: { width: 390, height: 844 } });
const m = await c2.newPage();
m.setDefaultTimeout(15000);
await m.goto(BASE + "/");
await m.getByRole("button", { name: "Sign up with email" }).click();
await m.locator(".roleseg button", { hasText: "here to train" }).click();
await m.getByPlaceholder("you@example.com").fill("sarah@example.com");
await m.getByPlaceholder("Password").fill("member-pass-123");
await m.getByRole("button", { name: "Create account" }).click();
await m.getByRole("button", { name: "Not now" }).click().catch(() => {});
await m.getByText("Pick your link.").waitFor();
await m.getByPlaceholder("Your name").fill("Sarah");
await m.getByRole("button", { name: "Claim it" }).click();
await m.getByRole("heading", { name: "Add a photo." }).waitFor();
await m.getByRole("button", { name: "Continue" }).click();
await m.locator("#wLocation").fill("Jersey City, NJ");
await m.getByRole("button", { name: "Finish setup" }).click();
await m.waitForURL("**/feed");
await m.goto(BASE + "/carina");
await m.locator(".profacts .followpill").waitFor();
await m.waitForTimeout(500);
await m.locator(".profacts .followpill").click();
await m.locator(".profacts .followpill", { hasText: "Following" }).waitFor();
await m.goto(BASE + "/feed");
await m.locator(".feeditem, .ps-event").first().waitFor();
{
  const row = m.locator(".feedagenda .swiperow").first();
  await row.locator(".ps-event").waitFor();
  const box = await row.boundingBox();
  const y = box.y + box.height / 2;
  const from = box.x + box.width - 20;
  await m.mouse.move(from, y);
  await m.mouse.down();
  for (const step of [35, 70, 100, 120]) await m.mouse.move(from - step, y, { steps: 3 });
  await m.mouse.up();
  await row.locator(".ps-event.goingon").waitFor();
  console.log("member marked going");
}

// FIRST: the coach edits the class. The marks must survive that, and the edit
// must not fail on a foreign key.
await co.goto(BASE + "/app");
await co.locator(".ps-event").first().click();
await co.getByRole("heading", { name: /Edit class/ }).waitFor();
await co.locator("#fDesc").fill("Bring a mat.");
await co.locator(".publishwrap .btn").click();
await co.getByText("Saved", { exact: true }).waitFor();
await co.waitForTimeout(1200);
await m.goto(BASE + "/feed");
await m.waitForTimeout(900);
const stillGoing = await m.locator(".ps-event.goingon").count();
if (stillGoing !== 1) fail(`editing the class dropped the Going mark (${stillGoing} left)`);
console.log("an edit keeps the Going marks ok");

// --- copy week as text, from Share on their own page
await co.goto(BASE + "/carina");
await co.locator(".profacts .actpill").first().waitFor();
await c1.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
await co.locator(".profacts .actpill", { hasText: "Share" }).click();
await co.getByRole("button", { name: "Copy your week" }).click();
await co.getByText("Week copied", { exact: false }).waitFor();
const pasted = await co.evaluate(() => navigator.clipboard.readText());
if (!/HYROX/.test(pasted)) fail("the copied week has no classes in it");
if (!/6:00am/.test(pasted)) fail(`the copied week has no times: ${pasted.slice(0, 120)}`);
if (!/Ironbound/.test(pasted)) fail("the copied week doesn't say where");
if (!pasted.includes("fittlist.co/carina")) fail("the copied week drops the link");
console.log("week copies as text ok");

// --- the member's calendar feed is hidden for now (the subscribe flow needs
// work), so settings must NOT offer it; the endpoint stays for old links.
await m.goto(BASE + "/you");
await m.waitForTimeout(700);
await m.getByRole("button", { name: "Not right now" }).click().catch(() => {});
if (await m.getByText("Add classes to your calendar").count())
  fail("the calendar feed row should be hidden");
console.log("calendar feed door hidden ok");

// The token is the key, so a wrong one gets nothing.
const bad = await m.request.get(BASE + "/api/cal/me/not-a-real-token");
if (bad.status() !== 404) fail(`a bad calendar token returned ${bad.status()}, not 404`);
console.log("a bad calendar token gets nothing ok");

// coach deletes the whole class
await co.goto(BASE + "/app");
await co.locator(".ps-event").first().click();
await co.getByRole("heading", { name: /Edit class/ }).waitFor();
await co.getByRole("button", { name: "Delete this class" }).click();
await co.getByRole("dialog").waitFor();
const all = co.getByRole("button", { name: /All \d+ days it runs/ }).first();
if (await all.count()) await all.click();
else await co.getByRole("button", { name: /Every /}).first().click();
await co.waitForTimeout(1500);
await co.goto(BASE + "/app");
await co.waitForTimeout(800);
const left = await co.locator(".ps-event").count();
// This is the bug: a Going mark references the class row, so the delete used
// to fail on the foreign key and the class simply stayed.
if (left !== 0) fail(`deleting a class someone marked Going left ${left} of it behind`);
console.log("a class with Going marks can be deleted ok");

// and the member hears about it
await m.goto(BASE + "/updates");
await m.waitForTimeout(900);
const notifs = (await m.locator(".notifrow").allInnerTexts()).join(" | ");
if (!/cancelled HYROX/.test(notifs))
  fail(`nobody told the member their class was cancelled: ${notifs}`);
if (!/in your week/.test(notifs)) fail("the cancellation doesn't say why they got it");
console.log("the member is told their class was cancelled ok");
await b.close();
console.log("GOING CHECKS PASSED");
