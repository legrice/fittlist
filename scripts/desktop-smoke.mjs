// The desktop shell: the tabs as header links, and the arrows that page the
// coach rail. Both exist because a mouse can neither reach a bottom bar nor
// swipe a row of avatars.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
//   node scripts/desktop-smoke.mjs
import { chromium } from "playwright";
import { fillLocation, skipSetup } from "./lib/wizard.mjs";
const BASE = "http://localhost:3000";
const OUT = process.env.SMOKE_OUT ?? ".";
const fail = (m) => { throw new Error("DESKTOP FAIL: " + m); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

// eight coaches, so the rail definitely runs off the edge
const names = ["Carina", "Julia", "Matt", "MattsWife", "Melikab", "Romeo", "Sasha", "Tobi"];
for (const [i, n] of names.entries()) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await c.newPage();
  p.setDefaultTimeout(15000);
  await p.goto(BASE + "/");
  await p.getByRole("button", { name: "Sign up with email" }).click();
  await p.getByPlaceholder("you@example.com").fill(`c${i}@example.com`);
  await p.getByPlaceholder("Password").fill("coach-pass-123");
  await p.getByRole("button", { name: "Create account" }).click();
  await p.getByRole("button", { name: "Not now" }).click().catch(() => {});
  await p.getByText("Pick your link.").waitFor();
  await p.getByPlaceholder("Your name").fill(n);
  await p.getByRole("button", { name: "Claim it" }).click();
  await skipSetup(p);
  await p.getByRole("heading", { name: "Your week is empty" }).waitFor();
  await p.getByRole("button", { name: "Add your first class" }).click();
  await p.getByPlaceholder("e.g. Barbell Strength").fill(`${n} Class`);
  for (const d of ["Mo", "Tu", "We", "Th", "Fr"]) {
    await p.getByRole("button", { name: d, exact: true }).click();
  }
  await p.getByRole("button", { name: "Select or start typing a studio" }).click();
  await p.getByRole("heading", { name: "Choose a studio" }).waitFor();
  const existing = p.locator(".studio-row", { hasText: "Ironbound Strength" }).first();
  if (await existing.count()) {
    await existing.click();
  } else {
    await p.getByRole("button", { name: "+ New studio" }).click();
    await p.getByPlaceholder("e.g. Palisade Barbell").fill("Ironbound Strength");
    await p.getByPlaceholder("e.g. 501 Palisade Ave, Jersey City").fill("143 Newark Ave, Jersey City");
    await p.getByRole("button", { name: "Add studio" }).click();
  }
  await p.locator(".studio-sel .nm", { hasText: "Ironbound Strength" }).waitFor();
  await p.locator(".publishwrap .btn").click();
  await p.waitForTimeout(800);
  await c.close();
}
console.log("eight coaches with classes ok");

// a member follows all of them
const mc = await b.newContext({ viewport: { width: 1280, height: 900 } });
const m = await mc.newPage();
m.setDefaultTimeout(15000);
await m.goto(BASE + "/");
await m.getByRole("button", { name: "Sign up with email" }).click();
await m.locator(".roleseg button", { hasText: "here to train" }).click();
await m.getByPlaceholder("you@example.com").fill("mem@example.com");
await m.getByPlaceholder("Password").fill("member-pass-123");
await m.getByRole("button", { name: "Create account" }).click();
await m.getByRole("button", { name: "Not now" }).click().catch(() => {});
await m.getByText("Pick your link.").waitFor();
await m.getByPlaceholder("Your name").fill("Sarah");
await m.getByRole("button", { name: "Claim it" }).click();
await m.getByRole("heading", { name: "Add a photo." }).waitFor();
await m.getByRole("button", { name: "Continue" }).click();
await m.getByRole("heading", { name: "Tell people who you are." }).waitFor();
await fillLocation(m);
await m.getByRole("button", { name: "Finish setup" }).click();
await m.waitForURL("**/feed");
for (const n of names) {
  // Following moved off the list and onto the profile: the row gets you to a
  // person, and the pill by their name is where the follow happens.
  await m.goto(`${BASE}/discover`);
  // Exact name: the list orders newest-first now, so a substring match on
  // "Matt" lands on MattsWife, who joined after him and sits above him.
  const row = m.locator(".disrow", {
    has: m.locator(".nm", { hasText: new RegExp(`^${n}$`) }),
  });
  await row.waitFor();
  await row.locator(".disrow-main").click();
  await m.waitForSelector(".profacts .followpill");
  await m.waitForTimeout(400);
  await m.locator(".profacts .followpill").click();
  await m.locator(".profacts .followpill", { hasText: "Following" }).waitFor();
}
console.log("followed all eight ok");

await m.goto(BASE + "/feed");
await m.locator(".feedstrip").waitFor();
await m.waitForTimeout(500);

// the tabs, as header links, with the bottom bar gone
{
  await m.locator(".headnav").waitFor({ state: "visible" });
  const labels = await m.locator(".headnav-l").allInnerTexts();
  // The same three everyone gets; only where You points differs.
  if (labels.join("|") !== "Home|Classes|Discover|You")
    fail(`a member's header links should be Home, Classes, Discover and You, got ${labels}`);
  if (await m.locator(".navbar").isVisible()) fail("the bottom bar is still showing on a desktop width");
  if ((await m.locator(".headnav-l svg").count()) !== 0) fail("the header links have icons");
  const on = await m.locator(".headnav-l.on").innerText();
  if (on !== "Classes") fail(`the lit link is "${on}", expected Classes`);
  await m.locator(".headnav-l", { hasText: "Discover" }).click();
  await m.waitForURL(/\/discover/);
  await m.locator(".headnav-l.on", { hasText: "Discover" }).waitFor();
  await m.locator(".headnav-l", { hasText: "Classes" }).click();
  await m.waitForURL(/\/feed/);
  await m.locator(".headnav-l.on", { hasText: "Classes" }).waitFor();
  await m.locator(".feedav").first().waitFor();
  console.log("header links navigate and light up ok");
}

// Nine avatars (All, plus the eight) is what makes the rail overflow, so a
// missing arrow below should mean the arrow is broken, not the fixture.
{
  await m.locator(".feedav").first().waitFor();
  const n = await m.locator(".feedav").count();
  if (n !== names.length + 1)
    fail(`expected ${names.length + 1} avatars in the rail, got ${n} at ${m.url()}`);
}
const rightArrow = m.locator(".railarrow-r");
if (!(await rightArrow.isVisible())) fail("no right arrow with a rail that overflows");
if (await m.locator(".railarrow-l").isVisible().catch(() => false))
  fail("left arrow showing at the start of the rail");
await m.screenshot({ path: OUT + "/shot-rail-1-right.png" });

const before = await m.locator(".feedstrip").evaluate((e) => e.scrollLeft);
await rightArrow.click();
await m.waitForTimeout(700);
const after = await m.locator(".feedstrip").evaluate((e) => e.scrollLeft);
if (after <= before) fail(`the arrow did not scroll (${before} -> ${after})`);
console.log(`scrolled ${before} -> ${after} ok`);
if (!(await m.locator(".railarrow-l").isVisible())) fail("left arrow missing after scrolling");
await m.screenshot({ path: OUT + "/shot-rail-2-both.png" });

// scroll to the end: the right arrow retires
await m.locator(".feedstrip").evaluate((e) => e.scrollTo({ left: e.scrollWidth }));
await m.waitForTimeout(600);
if (await m.locator(".railarrow-r").isVisible().catch(() => false))
  fail("right arrow still showing at the end of the rail");
console.log("arrows retire at each end ok");
await m.screenshot({ path: OUT + "/shot-rail-3-end.png" });

// a phone gets none of this: it swipes. The gate is the pointer, not the
// width, so this needs a context that actually reports a coarse one.
const tc = await b.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  storageState: await mc.storageState(),
});
const t = await tc.newPage();
t.setDefaultTimeout(15000);
await t.goto(BASE + "/feed");
await t.locator(".feedstrip").waitFor();
await t.waitForTimeout(500);
if (!(await t.locator(".feedav").first().isVisible())) fail("the rail itself vanished on a phone");
const shown = await t.locator(".railarrow").evaluateAll((els) =>
  els.filter((e) => getComputedStyle(e).display !== "none").length,
);
if (shown !== 0) fail(`${shown} arrows rendered on a touch pointer`);
console.log("no arrows on a touch pointer ok");

await b.close();
console.log("DESKTOP CHECKS PASSED");
