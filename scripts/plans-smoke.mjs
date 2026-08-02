// Your plans: the shared class rows, and what one of your own does when you
// tap it. A personal class has no page, so the sheet, the editor and the
// picture are the whole of what it can do.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
//   node scripts/plans-smoke.mjs
import { chromium } from "playwright";
import { skipSetup } from "./lib/wizard.mjs";
const BASE = "http://localhost:3000";
const OUT = process.env.SMOKE_OUT ?? ".";
const fail = (m) => { throw new Error("PLANS FAIL: " + m); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

// a coach with a class, so Plans has a real row as well as a personal one
const c1 = await b.newContext({ viewport: { width: 390, height: 844 } });
const co = await c1.newPage();
co.setDefaultTimeout(20000);
await co.goto(BASE + "/");
await co.getByRole("button", { name: "Sign up with email" }).click();
await co.getByPlaceholder("you@example.com").fill("carina@example.com");
await co.getByPlaceholder("Password").fill("coach-pass-123");
await co.getByRole("button", { name: "Create account" }).click();
await co.getByRole("button", { name: "Not now" }).click().catch(() => {});
await co.getByText("Pick your link.").waitFor();
await co.getByPlaceholder("Your name").fill("Carina Clores");
await co.getByRole("button", { name: "Claim it" }).click();
await skipSetup(co);
await co.getByRole("button", { name: /Add your first class|Add class/ }).first().click();
await co.getByPlaceholder("e.g. Barbell Strength").fill("Lower Body Strength");
for (const d of ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"])
  await co.getByRole("button", { name: d, exact: true }).click();
await co.getByRole("button", { name: "Select or start typing a studio" }).click();
await co.getByRole("button", { name: "+ New studio" }).click();
await co.getByPlaceholder("e.g. Palisade Barbell").fill("Iron Culture");
await co.getByPlaceholder("e.g. 501 Palisade Ave, Jersey City").fill("424 Eagle Rock Ave, West Orange NJ");
await co.getByRole("button", { name: "Add studio" }).click();
await co.locator(".publishwrap .btn").click();
await co.waitForTimeout(1000);
await co.close();

const c2 = await b.newContext({ viewport: { width: 390, height: 844 } });
const m = await c2.newPage();
m.setDefaultTimeout(20000);
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

// follow and add one of the coach's classes, so Plans has a real row
await m.goto(BASE + "/carinaclores");
await m.getByRole("button", { name: "Follow", exact: true }).first().click();
await m.waitForTimeout(500);
await m.goto(BASE + "/feed");
await m.locator(".ps-event").first().click();
await m.locator(".classoverlay-nm").waitFor();
await m.locator(".ovcta-save").click();
await m.waitForTimeout(500);
await m.locator(".ovcircle-back").click();
await m.waitForTimeout(400);

// one of their own
await m.goto(BASE + "/week");
await m.locator(".schedtools").waitFor();
await m.locator(".calhead-add").click();
await m.getByRole("heading", { name: "Add to your calendar" }).waitFor();
await m.locator(".sheet .setrow", { hasText: "going to" }).click();
await m.getByPlaceholder("e.g. Barbell Strength").fill("Swag by LWL");
await m.getByRole("button", { name: "Sa", exact: true }).click();
await m.locator("#fDesc").fill("Choreo class, low lights, no mirrors.");
await m.locator(".publishwrap .btn").click();

// the note, and the picture behind it
await m.locator(".folhint-t", { hasText: "Added to your plans" }).waitFor();
await m.screenshot({ path: OUT + "/shot-plans-note.png" });
await m.locator(".folhint-go").click();
await m.getByRole("heading", { name: "Share this class" }).waitFor();
await m.locator(".sheet img").first().waitFor();
await m.waitForTimeout(1200);
await m.screenshot({ path: OUT + "/shot-plans-card.png" });
const cardOk = await m.evaluate(async () => {
  const img = document.querySelector(".sheet img");
  return img && img.naturalWidth > 0 ? img.naturalWidth : 0;
});
if (cardOk !== 1080) fail("the card should render 1080 wide, got " + cardOk);
console.log("card ok (" + cardOk + "px)");
await m.locator(".sheet .sheetclose").click();
await m.locator(".ovcircle-back").click();
await m.waitForTimeout(400);

// the list: the shared rows, with the coach's face on the one that has a coach
await m.goto(BASE + "/week");
await m.locator(".ps-agenda .ps-event").first().waitFor();
const rows = await m.locator(".ps-erow").count();
if (rows < 2) fail("expected the coach's class and the personal one, got " + rows);
if (!(await m.locator(".ps-ecoachav").count())) fail("the coach's row should carry their face");
if (!(await m.locator(".ps-goingtag", { hasText: "Going" }).count()))
  fail("an added row should say Going in its corner");
if (await m.locator(".ps-erow", { hasText: "Swag by LWL" }).locator(".ps-goingtag").count())
  fail("a personal row carries no badge: the tab already says why it is here");
if (await m.locator(".weekrow-nm").count()) fail("the old bespoke row markup should be gone");
// Share moved onto the rail; the floating pill is gone.
if (await m.locator(".weekshare").count()) fail("the floating share pill should be gone");
await m.locator(".schedtool", { hasText: "Share" }).first().waitFor();
await m.waitForTimeout(300);
await m.screenshot({ path: OUT + "/shot-plans-list.png" });

// tapping the coach's row opens the class sheet
await m.locator(".ps-erow", { hasText: "Lower Body Strength" }).locator(".ps-event").first().click();
await m.locator(".classoverlay-nm", { hasText: "Lower Body Strength" }).waitFor();
await m.locator(".ovcircle-back").click();
await m.waitForTimeout(400);

// tapping your own opens the plan sheet, and it can be edited
await m.locator(".ps-erow", { hasText: "Swag by LWL" }).locator(".ps-event").first().click();
await m.locator(".classoverlay-nm", { hasText: "Swag by LWL" }).waitFor();
await m.getByText("Choreo class, low lights").waitFor();
await m.getByText("Yours alone.").waitFor();
await m.waitForTimeout(300);
await m.screenshot({ path: OUT + "/shot-plans-sheet.png" });
await m.locator(".ovcta-btn", { hasText: "Edit" }).click();
await m.getByRole("heading", { name: "Edit class" }).waitFor();
const nameVal = await m.getByPlaceholder("e.g. Barbell Strength").inputValue();
if (nameVal !== "Swag by LWL") fail("the editor should open filled in, got " + nameVal);
await m.getByPlaceholder("e.g. Barbell Strength").fill("Swag by LWL II");
await m.getByRole("button", { name: "Su", exact: true }).click();
await m.waitForTimeout(200);
await m.screenshot({ path: OUT + "/shot-plans-edit.png" });
await m.locator(".publishwrap .btn", { hasText: "Save changes" }).click();
await m.waitForTimeout(1200);
await m.locator(".ps-erow", { hasText: "Swag by LWL II" }).first().waitFor();
// A weekly entry recurs across the horizon now, so the check is that every
// occurrence carries the new name: an edit moved the entry, it didn't fork
// it, and the old name survives nowhere on its own.
const allSwag = await m.locator(".ps-erow", { hasText: "Swag by LWL" }).count();
const renamed = await m.locator(".ps-erow", { hasText: "Swag by LWL II" }).count();
if (allSwag !== renamed)
  fail(`an edit should move the entry, not fork it: ${allSwag} rows, ${renamed} renamed`);
console.log("edit ok (one entry, every occurrence moved with it)");

await b.close();
console.log("ALL PLANS CHECKS PASSED");
