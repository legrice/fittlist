// The circles tray and the peek behind a face: the whole of what a follow buys
// now. Following puts a coach up there and nothing else; tapping opens their
// fortnight; saving from it is what fills the calendar. If this suite goes red,
// following the app's core action does nothing visible.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
//   node scripts/tray-smoke.mjs
import { chromium } from "playwright";
import { skipSetup } from "./lib/wizard.mjs";
const BASE = "http://localhost:3000";
const OUT = process.env.SMOKE_OUT ?? ".";
const fail = (m) => { throw new Error("TRAY FAIL: " + m); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

const c1 = await b.newContext({ viewport: { width: 390, height: 844 } });
const co = await c1.newPage();
co.setDefaultTimeout(20000);
await co.goto(BASE + "/");
await co.getByRole("button", { name: "Sign up with email" }).click();
await co.getByPlaceholder("you@example.com").fill("erin@example.com");
await co.getByPlaceholder("Password").fill("coach-pass-123");
await co.getByRole("button", { name: "Create account" }).click();
await co.getByRole("button", { name: "Not now" }).click().catch(() => {});
await co.getByText("Pick your link.").waitFor();
await co.getByPlaceholder("Your name").fill("Erin Clyne");
await co.getByRole("button", { name: "Claim it" }).click();
await skipSetup(co);
await co.getByRole("button", { name: /Add your first class|Add class/ }).first().click();
await co.getByPlaceholder("e.g. Barbell Strength").fill("Soul Flow Yoga");
for (const d of ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"])
  await co.getByRole("button", { name: d, exact: true }).click();
await co.locator("#fStart").fill("18:00");
await co.getByRole("button", { name: "Select or start typing a studio" }).click();
await co.getByRole("button", { name: "+ New studio" }).click();
await co.getByPlaceholder("e.g. Palisade Barbell").fill("Asana Soul Practice");
await co.getByPlaceholder("e.g. 501 Palisade Ave, Jersey City").fill("12 Main St, Montclair NJ");
await co.getByRole("button", { name: "Add studio" }).click();
await co.locator(".publishwrap .btn").click();
await co.waitForTimeout(1200);
await co.close();

const c2 = await b.newContext({ viewport: { width: 390, height: 844 } });
const m = await c2.newPage();
m.setDefaultTimeout(20000);
await m.goto(BASE + "/");
await m.getByRole("button", { name: "Sign up with email" }).click();
await m.locator(".roleseg button", { hasText: "here to train" }).click();
await m.getByPlaceholder("you@example.com").fill("kia@example.com");
await m.getByPlaceholder("Password").fill("member-pass-123");
await m.getByRole("button", { name: "Create account" }).click();
await m.getByRole("button", { name: "Not now" }).click().catch(() => {});
await m.getByText("Pick your link.").waitFor();
await m.getByPlaceholder("Your name").fill("Kia");
await m.getByRole("button", { name: "Claim it" }).click();
await m.getByRole("heading", { name: "Add a photo." }).waitFor();
await m.getByRole("button", { name: "Continue" }).click();
await m.locator("#wLocation").fill("Montclair, NJ");
await m.getByRole("button", { name: "Finish setup" }).click();
await m.waitForURL("**/feed");

await m.goto(BASE + "/erinclyne");
await m.getByRole("button", { name: "Follow", exact: true }).first().click();
await m.waitForTimeout(600);

// The tray, on an empty calendar: the state where it matters most.
await m.goto(BASE + "/week");
await m.locator(".tray").waitFor();
const names = await m.locator(".trayitem-nm").allInnerTexts();
console.log("tray:", names.join(" | "));
if (!names.includes("Erin")) fail("the coach they follow should be a circle: " + names.join());
if (names[names.length - 1] !== "Add") fail("the plus should end the rail");
if (!(await m.locator(".trayav.fresh").count()))
  fail("a coach never peeked at should be lit");
await m.waitForTimeout(400);
await m.screenshot({ path: OUT + "/shot-tray-empty.png" });

// The peek, and saving from it.
await m.locator(".trayitem", { hasText: "Erin" }).click();
await m.locator(".peeksheet").waitFor();
await m.locator(".peekrow").first().waitFor();
const peekRows = await m.locator(".peekrow").count();
console.log("peek rows:", peekRows);
if (peekRows < 7) fail("a daily class should fill the fortnight, got " + peekRows);
await m.waitForTimeout(500);
await m.screenshot({ path: OUT + "/shot-peek.png" });
await m.locator(".peekadd").first().click();
await m.locator(".peekadd.on").first().waitFor();
await m.waitForTimeout(700);
await m.screenshot({ path: OUT + "/shot-peek-saved.png" });
await m.locator(".sheetclose").first().click();
await m.waitForTimeout(400);

// ...and the ring is out, because they have looked.
await m.reload();
await m.locator(".tray").waitFor();
if (await m.locator(".trayav.fresh").count())
  fail("the ring should be out once they have opened the peek");
// ...and the class landed on the calendar.
await m.locator(".ps-event").first().waitFor();
await m.waitForTimeout(500);
await m.screenshot({ path: OUT + "/shot-tray-full.png" });
console.log("saved from the peek, and it is on the week");

await b.close();
console.log("ALL TRAY CHECKS PASSED");
