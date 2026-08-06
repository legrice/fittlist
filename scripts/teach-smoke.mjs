// "I teach too": the switch the whole account model rests on. One kind of
// account, and teaching is a thing it carries rather than a second signup.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
//   node scripts/teach-smoke.mjs
import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const fail = (m) => { throw new Error("TEACH FAIL: " + m); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const c = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await c.newPage();
p.setDefaultTimeout(20000);
await p.goto(BASE + "/");
await p.getByRole("button", { name: "Sign up with email" }).click();
await p.locator(".roleseg button", { hasText: "here to train" }).click();
await p.getByPlaceholder("you@example.com").fill("kia@example.com");
await p.getByPlaceholder("Password").fill("member-pass-123");
await p.getByRole("button", { name: "Create account" }).click();
await p.getByRole("button", { name: "Not now" }).click().catch(() => {});
await p.getByText("Pick your link.").waitFor();
await p.getByPlaceholder("Your name").fill("Kia Bright");
await p.getByRole("button", { name: "Claim it" }).click();
await p.getByRole("heading", { name: "Add a photo." }).waitFor();
await p.getByRole("button", { name: "Continue" }).click();
await p.locator("#wLocation").fill("Montclair, NJ");
await p.getByRole("button", { name: "Finish setup" }).click();
await p.waitForURL("**/feed");

const tabs = async () =>
  (await p.locator(".navtab").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());

// A member: two tabs, and the Profile one wears their face rather than a glyph.
let t = await tabs();
console.log("member tabs:", t.join(" | "));
if (t.length !== 2) fail("a member gets two tabs, got " + t.join());
if (!(await p.locator(".navtab[data-tab='you'] .navface-initial, .navtab[data-tab='you'] .navface-photo").count()))
  fail("the Profile tab should wear the viewer's face");
await p.goto(BASE + "/calendar");
await p.waitForURL(/\/feed/);
console.log("a member has no calendar to land on: /calendar sends them to Following");

// Turn teaching on: the Calendar tab arrives without a reload.
await p.goto(BASE + "/you");
const row = p.locator(".setrow", { hasText: "I teach too" });
await row.waitFor();
if (await row.locator(".switch.on").count()) fail("a member starts with it off");
await row.click();
await p.waitForTimeout(1600);
if (!(await row.locator(".switch.on").count())) fail("the switch should read on");
// No reload. The bar is rendered by the layout above this screen, so a switch
// that adds a tab and leaves the bar alone until the next navigation has
// plainly not worked; router.refresh() has to reach the whole shell.
t = await tabs();
console.log("after turning it on:", t.join(" | "));
if (t.length !== 3 || !t[0].includes("Calendar")) fail("expected a Calendar tab first, got " + t.join());
await p.screenshot({ path: (process.env.SMOKE_OUT ?? ".") + "/shot-teach-on.png" });

// ...and the calendar is real: it loads, and offers the first class.
await p.locator(".navtab", { hasText: "Calendar" }).click();
await p.waitForURL(/\/calendar/);
await p.locator(".wkempty-t", { hasText: "Your week is empty" }).waitFor();
console.log("the Calendar tab opens a real, empty week");

// Turn it off again: the tab goes, and nothing else is harmed.
await p.goto(BASE + "/you");
await p.locator(".setrow", { hasText: "I teach too" }).click();
await p.waitForTimeout(1400);
t = await tabs();
console.log("after turning it off:", t.join(" | "));
if (t.length !== 2) fail("turning it off should take the tab away, got " + t.join());

await b.close();
console.log("ALL TEACH CHECKS PASSED");
