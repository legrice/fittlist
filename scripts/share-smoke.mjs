// The share composer: the middle of the tab bar, the picture, the controls.
//
// It is the one screen whose whole job is making something worth sending, so
// what this walks is the making: that the preview is a real PNG of the right
// shape, that collapsing the drawer actually grows it, that the picker's count
// and the picture agree, and that an empty week is an offer rather than a
// blank image.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
//   node scripts/share-smoke.mjs
import { chromium } from "playwright";
import { skipSetup } from "./lib/wizard.mjs";

const BASE = "http://localhost:3000";
const fail = (m) => { throw new Error("SHARE FAIL: " + m); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

/** The primary button is Share until the rows are in and Add once they are
 *  in and empty, so anything reading it has to wait for the count to settle
 *  or it reads the loading state. */
const settled = (p) =>
  p.waitForFunction(() => {
    const el = document.querySelector(".comprow-t small");
    return el && !/Loading/.test(el.textContent || "");
  }, null, { timeout: 30000 });

/** The drawer arrives shut, so anything driving a control has to pull it up
 *  first, exactly as a person would. */
const openTools = async (p) => {
  await p.locator(".compimg").waitFor();
  if ((await p.locator(".comptab").innerText()).trim() === "Edit") {
    await p.locator(".comptab").click();
    await p.waitForTimeout(350);
  }
};

const mk = async (email, name, member) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(20000);
  await p.goto(BASE + "/");
  await p.getByRole("button", { name: "Sign up with email" }).click();
  if (member) await p.locator(".roleseg button", { hasText: "here to train" }).click();
  await p.getByPlaceholder("you@example.com").fill(email);
  await p.getByPlaceholder("Password").fill("share-pass-123");
  await p.getByRole("button", { name: "Create account" }).click();
  await p.getByRole("button", { name: "Not now" }).click().catch(() => {});
  await p.getByText("Pick your link.").waitFor();
  await p.getByPlaceholder("Your name").fill(name);
  await p.getByRole("button", { name: "Claim it" }).click();
  if (member) {
    await p.getByRole("heading", { name: "Add a photo." }).waitFor();
    await p.getByRole("button", { name: "Continue" }).click();
    await p.locator("#wLocation").fill("Jersey City, NJ");
    await p.getByRole("button", { name: "Finish setup" }).click();
    await p.waitForURL("**/feed");
  } else {
    await skipSetup(p);
  }
  return p;
};

// ---- a coach with a real week
const coach = await mk("carina@example.com", "Carina Clores", false);
await coach.getByRole("button", { name: /Add your first class|Add class/ }).first().click();
await coach.getByPlaceholder("e.g. Barbell Strength").fill("Guns, Buns, and Lungs");
for (const d of ["Mo", "We", "Fr"])
  await coach.getByRole("button", { name: d, exact: true }).click();
await coach.getByRole("button", { name: "Select or start typing a studio" }).click();
await coach.getByRole("button", { name: "+ New studio" }).click();
await coach.getByPlaceholder("e.g. Palisade Barbell").fill("Ironbound Performance Athletics");
await coach
  .getByPlaceholder("e.g. 501 Palisade Ave, Jersey City")
  .fill("424 Eagle Rock Ave, West Orange NJ");
await coach.getByRole("button", { name: "Add studio" }).click();
await coach.locator(".publishwrap .btn").click();
await coach.waitForTimeout(1200);
await coach.locator(".sheetclose").first().click().catch(() => {});
console.log("a coach put a week up ok");

// ---- Share is the middle of the bar, and it is drawn like its neighbours
await coach.goto(BASE + "/feed");
{
  const tabs = (await coach.locator(".navtab").allInnerTexts()).map((t) =>
    t.replace(/\s+/g, " ").trim(),
  );
  if (tabs.length !== 5) fail("expected five tabs, got " + tabs.length + ": " + tabs.join("|"));
  if (!/Share/.test(tabs[2])) fail("Share should be the middle tab: " + tabs.join("|"));
  // A raised filled circle shipped for a build and came back out: the bar's
  // job is five equals, and what makes Share different is where it goes.
  if (await coach.locator(".navtab-center").count())
    fail("the Share tab should be drawn like every other tab");
}
await coach.locator(".navtab", { hasText: "Share" }).click();
await coach.waitForURL(/\/share/);
await coach.locator(".compimg").waitFor();
// The composer opens over the app: no bar underneath competing with it.
if (await coach.locator(".navbar:visible").count())
  fail("the composer should cover the tab bar, not sit above it");
console.log("the middle of the bar opens the composer ok");

// ---- the preview is a real 1080x1920 story, and there is no format to pick
const sizeOf = async () =>
  coach.locator(".compimg").evaluate(async (i) => {
    if (!i.complete) await new Promise((r) => i.addEventListener("load", r, { once: true }));
    return [i.naturalWidth, i.naturalHeight];
  });
await coach.waitForFunction(() => {
  const i = document.querySelector(".compimg");
  return i && i.naturalWidth > 0;
}, null, { timeout: 30000 });
{
  const [w, h] = await sizeOf();
  if (w !== 1080 || h !== 1920) fail(`a story should be 1080x1920, got ${w}x${h}`);
}
if (await coach.locator(".compfmt").count())
  fail("the Story/Square picker should be gone: the composer makes a story");
// The square canvas is still drawn by the route, and nothing in the app asks
// for one. Held here so the second format cannot rot while it waits for a
// control to offer it again.
{
  const r = await coach.request.get(`${BASE}/api/story/compose?kind=coaching&fmt=square`);
  if (!r.ok()) fail("the square canvas should still render at the route");
  const buf = await r.body();
  // PNG: width and height are big-endian 32-bit at byte 16 and 20.
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w !== 1080 || h !== 1080) fail(`the square route should be 1080x1080, got ${w}x${h}`);
}
console.log("one canvas offered, and the square still renders at the route ok");

// ---- it arrives on the picture, and the Edit tab is what costs it room
{
  // Shut on landing: you open this screen to see a result, not to answer a
  // form, so the first thing on it is the picture at full size.
  if ((await coach.locator(".comptab").innerText()).trim() !== "Edit")
    fail("the drawer should arrive collapsed, with the tab reading Edit");
  const shut = (await coach.locator(".compimg").boundingBox()).height;
  await coach.locator(".comptab").click();
  await coach.waitForTimeout(500);
  const open = (await coach.locator(".compimg").boundingBox()).height;
  if (shut <= open * 1.4)
    fail(`opening the tools should cost the picture room, got ${Math.round(shut)} -> ${Math.round(open)}`);
  // One control, not two: the pull bar came off and the word is the whole
  // affordance.
  if (await coach.locator(".compdrawer .grab").count())
    fail("the drawer should carry no pull bar, only the Edit tab");
}
console.log("it arrives on the picture, and Edit pulls the tools up ok");

// ---- the picker counts what is on the image, and hiding is not deleting
{
  const row = () => coach.locator(".comprow-t").innerText();
  if (!/All 3 showing/.test(await row())) fail("expected all three: " + (await row()));
  await coach.locator(".comprow").click();
  await coach.locator(".sheet h2", { hasText: "Classes on your image" }).waitFor();
  if (!/stays on your calendar/i.test(await coach.locator(".compnote").innerText()))
    fail("the sheet has to say that unchecking is not deleting");
  await coach.locator(".sheet .setrow").first().click();
  await coach.locator(".sheet .publishwrap .btn", { hasText: "Done" }).click();
  await coach.waitForTimeout(600);
  if (!/2 of 3 showing/.test(await row())) fail("hiding one should count: " + (await row()));
  // And the class is still on the calendar it was hidden from.
  await coach.goto(BASE + "/app");
  await coach.locator(".caladd").waitFor();
  const still = await coach.locator(".ps-event", { hasText: "Guns, Buns, and Lungs" }).count();
  if (still < 3) fail("hiding a class from the image removed it from the calendar");
}
console.log("the picker hides from the image only ok");

// ---- an empty range is an offer, not a blank picture. This has to run
// before the block below, which is the one that puts a class on this hat.
await coach.goto(BASE + "/share");
await openTools(coach);
{
  await coach.locator(".compseg button", { hasText: "Going" }).click();
  await settled(coach);
  const cta = await coach.locator(".compacts .btn").innerText();
  if (!/Add something to your week/.test(cta)) fail("expected the member-ish offer, got " + cta);
  if (await coach.locator(".compsave").count())
    fail("Save to photos should not be offered for an empty picture");
}
console.log("an empty week offers rather than draws nothing ok");

// ---- adding from the picker: the composer is where calendars get kept
// current, so a class typed here has to land on the calendar and, when a
// studio was named, in that studio's catalog. That loop is the whole growth
// argument for this screen: somebody makes a picture, and the inventory fills
// in behind them.
await coach.goto(BASE + "/share");
await openTools(coach);
await settled(coach);
{
  await coach.locator(".compseg button", { hasText: "Going" }).click();
  await settled(coach);
  await coach.locator(".comprow").click();
  await coach.locator(".sheet h2", { hasText: "Classes on your image" }).waitFor();
  if (!/added to your calendar too/i.test(await coach.locator(".compnote").innerText()))
    fail("the sheet has to say an add reaches the calendar, not just the picture");
  await coach.locator(".compadd").click();
  await coach.locator("#fName").waitFor();
  await coach.locator("#fName").fill("Reformer Pilates");
  for (const d of ["Tu", "Th"])
    await coach.getByRole("button", { name: d, exact: true }).click();
  await coach.getByRole("button", { name: "Select or start typing a studio" }).click();
  await coach.getByRole("button", { name: "+ New studio" }).click();
  await coach.getByPlaceholder("e.g. Palisade Barbell").fill("Asana Soul Practice");
  await coach
    .getByPlaceholder("e.g. 501 Palisade Ave, Jersey City")
    .fill("124 1st St, Jersey City, NJ");
  await coach.getByRole("button", { name: "Add studio" }).click();
  await coach.locator(".studio-sel .nm").waitFor();
  await coach.getByRole("button", { name: "Add to your plans" }).click();
  // Back on the composer, with the picture redrawn around it.
  await coach.locator(".compimg").waitFor();
  await coach.waitForFunction(() => {
    const el = document.querySelector(".comprow-t small");
    return el && /showing/.test(el.textContent || "");
  }, null, { timeout: 30000 });
  const row = await coach.locator(".comprow-t").innerText();
  if (!/showing/.test(row)) fail("the added class should count on the picture: " + row);
  // It is on the calendar, not only on the image.
  await coach.goto(BASE + "/week");
  await coach.goto(BASE + "/app");
  await coach.locator(".caladd").waitFor();
  if (!(await coach.locator(".ps-event", { hasText: "Reformer Pilates" }).count()))
    fail("a class added from the composer should be on the calendar");
  // And the studio it named is in the directory, which is the inventory
  // filling itself in behind somebody making a picture.
  const dir = await coach.request.get(`${BASE}/discover?half=studios`);
  if (!(await dir.text()).includes("Asana Soul Practice"))
    fail("the studio named while adding should reach the directory");
}
console.log("adding from the picker fills the calendar and the directory ok");

// ---- the headline is derived from the segment, and cannot be edited
await coach.goto(BASE + "/share");
await openTools(coach);
{
  if (await coach.locator(".comphl").count())
    fail("the headline is derived now: there should be no line to edit");
  if (await coach.locator(".complbl", { hasText: "Headline" }).count())
    fail("the headline control should be gone entirely");
  // It is still what the picture says, and it still follows the segment: the
  // query the preview is drawn from carries it.
  const story = () => coach.locator(".compimg").getAttribute("src");
  if (!/headline=Come\+train\+with\+me/.test(await story()))
    fail("Coaching should draw its own headline: " + (await story()));
  await coach.locator(".compseg button", { hasText: "Going" }).click();
  await coach.waitForTimeout(400);
  if (!/headline=My\+week/.test(await story()))
    fail("Going should draw its own headline: " + (await story()));
}
console.log("the headline derives from the segment and offers no edit ok");

await coach.close();

// ---- a member has one hat, so the segment is gone rather than disabled
const member = await mk("sarah@example.com", "Sarah", true);
await member.goto(BASE + "/share");
await member.locator(".compimg").waitFor();
await settled(member);
if (await member.locator(".compseg").count())
  fail("a member should not get a segment with one option in it");
if (!/headline=My\+week/.test(await member.locator(".compimg").getAttribute("src")))
  fail("a member's picture should say My week");
{
  const cta = await member.locator(".compacts .btn").innerText();
  if (!/Add something to your week/.test(cta)) fail("an empty member should be offered: " + cta);
}
console.log("a member gets one hat and no segment ok");

// The composer is reachable above the breakpoint too, where the bar is gone.
await member.setViewportSize({ width: 1280, height: 900 });
await member.goto(BASE + "/feed");
await member.locator(".headnav").waitFor();
{
  const links = await member.locator(".headnav-l").allInnerTexts();
  if (!links.some((l) => /Share/.test(l)))
    fail("the header needs Share too, or the composer is a dead end on desktop: " + links.join("|"));
}
console.log("the composer is reachable on desktop ok");
await member.close();

await b.close();
console.log("SHARE OK");
