// The Share tab's editor: the coach's old "Share your schedule" sheet,
// promoted to the tab, with the Classes picker standing where My week / Today
// used to and no headline field at all.
//
// It is the one screen whose whole job is making something worth sending, so
// what this walks is the making: that the preview is a real PNG, that the
// picker's count and the picture agree, that adding a class from the picker
// reaches the calendar and the studio directory, and that an empty week is an
// offer rather than a blank image.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
//   node scripts/share-smoke.mjs
import { chromium } from "playwright";
import { skipSetup } from "./lib/wizard.mjs";

const BASE = "http://localhost:3000";
const fail = (m) => { throw new Error("SHARE FAIL: " + m); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

/** Pick a hat. The Coaching/Going segment moved inside the Classes sheet,
 *  which is the list it decides, so choosing one means opening that sheet. */
const pickHat = async (pg, hat) => {
  await pg.locator(".comprow").click();
  await pg.locator(".sheet h2", { hasText: "Classes on your image" }).waitFor();
  await pg.locator(".sheet .share-toggles .seg button", { hasText: hat }).click();
  await pg.waitForTimeout(400);
  await pg.locator(".sheet .sheetclose").first().click();
  await pg.waitForTimeout(400);
};

/** The Classes row reads "Loading" until the rows are in, and the primary
 *  button is Share image until they are in and empty, so anything reading
 *  either has to wait for the count to settle.
 *
 *  It waits for a settled *value* rather than for "Loading" to be absent:
 *  switching hats resets the rows, and a check for the absence can pass
 *  against the previous load's answer in the frame before React clears it. */
const settled = (p) =>
  p.waitForFunction(() => {
    const el = document.querySelector(".comprow-t");
    return el && /showing|Nothing/.test(el.textContent || "");
  }, null, { timeout: 30000 });

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
    await p.waitForURL("**/week");
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

// ---- Share is the calendar's own button, not a tab
await coach.goto(BASE + "/app");
{
  const tabs = (await coach.locator(".navtab").allInnerTexts()).map((t) =>
    t.replace(/\s+/g, " ").trim(),
  );
  if (tabs.length !== 2) fail("expected two tabs, got " + tabs.length + ": " + tabs.join("|"));
  // Share took the middle of the bar for a build and came back out: it is an
  // act rather than a place, and it belongs on the screen it is about.
  if (tabs.some((t) => /Share/.test(t)))
    fail("Share should not be a tab: " + tabs.join("|"));
}
await coach.goto(BASE + "/app");
await coach.locator(".calshare").click();
await coach.waitForURL(/\/share/);
await coach.locator(".composer").waitFor();
await coach.locator(".adderhead h2", { hasText: "Share your schedule" }).waitFor();
// It opens over the app: no bar underneath competing with it.
if (await coach.locator(".navbar:visible").count())
  fail("the editor should cover the tab bar, not sit above it");
console.log("the calendar's Share button opens the editor ok");

// ---- everything is in one scroll: no drawer, no format picker, no headline
{
  if (await coach.locator(".comptab").count())
    fail("the collapsing drawer is gone: the editor is one scroll");
  if (await coach.locator(".compfmt").count())
    fail("the Story/Square picker should be gone: the editor makes a story");
  if (await coach.locator("#stHeadline").count())
    fail("the headline field should be gone: it maps from the hat");
  const labels = (await coach.locator(".storycustom .flabel").allInnerTexts()).map((t) =>
    t.replace(/\s+/g, " ").trim(),
  );
  if (!/^Classes/.test(labels[0] ?? ""))
    fail("Classes should stand where the range picker was: " + labels.join("|"));
  if (!/^Style/.test(labels[1] ?? "")) fail("Style should follow it: " + labels.join("|"));
}
console.log("one scroll, and the range picker is gone ok");

// ---- the preview is a real 1080x1920 story
// `complete`, not just naturalWidth: a progressively decoding PNG reports its
// dimensions long before it has all its rows, so naturalWidth alone said
// "ready" in the middle of the very load this section is about.
await coach.waitForFunction(() => {
  const i = document.querySelector(".storyimg");
  return i && i.complete && i.naturalWidth > 0;
}, null, { timeout: 30000 });
{
  const [w, h] = await coach
    .locator(".storyimg")
    .evaluate((i) => [i.naturalWidth, i.naturalHeight]);
  if (w !== 1080 || h !== 1920) fail(`a story should be 1080x1920, got ${w}x${h}`);
}
// The poster is never shown half-drawn. Satori generates the PNG while the
// body streams, which takes a few hundred milliseconds for a week, and Safari
// paints the rows as they land: the preview was the top inch of a poster with
// a line of text sliced through it for the whole of that. It is hidden until
// it has loaded and the last good frame holds its place, so what is on screen
// is always a whole picture.
{
  await coach.locator(".storyimg-wrap").waitFor();
  // It fades in over .14s, so this waits for the value to settle rather than
  // sampling it mid-transition.
  await coach
    .waitForFunction(
      () => getComputedStyle(document.querySelector(".storyimg")).opacity === "1",
      null,
      { timeout: 5000 },
    )
    .catch(async () => {
      const o = await coach.locator(".storyimg").evaluate((i) => getComputedStyle(i).opacity);
      fail("a loaded poster should end up visible, got " + o);
    });
  // The ground under it is the poster's own paper, not a slab of some other
  // colour: a half-drawn poster on black read as broken rather than pending.
  const ground = await coach
    .locator(".storyimg-wrap")
    .evaluate((e) => getComputedStyle(e).backgroundColor);
  if (!ground || ground === "rgba(0, 0, 0, 0)")
    fail("the preview should sit on the theme's paper, got " + ground);

  // And it is drawn at the poster's real proportions. The composer is a
  // fixed-height flex column, so the preview is a flex item on the main axis
  // and gets squashed to make the screen add up unless it refuses to shrink.
  // Twice this shipped as a near-square that nothing about the box explained.
  const box = await coach.locator(".storyimg-wrap").boundingBox();
  const ratio = box.height / box.width;
  if (Math.abs(ratio - 16 / 9) > 0.06)
    fail(`the preview should be 9:16, got ${box.width}x${box.height} (${ratio.toFixed(2)})`);
}
// The square canvas is still drawn by the route, and nothing in the app asks
// for one. Held here so the second format cannot rot while it waits for a
// control to offer it again.
{
  const r = await coach.request.get(`${BASE}/api/story/compose?kind=coaching&fmt=square`);
  if (!r.ok()) fail("the square canvas should still render at the route");
  const buf = await r.body();
  // PNG: width and height are big-endian 32-bit at byte 16 and 20.
  if (buf.readUInt32BE(16) !== 1080 || buf.readUInt32BE(20) !== 1080)
    fail("the square route should be 1080x1080");
}
console.log("one canvas offered, and the square still renders at the route ok");

// ---- the headline maps from the hat, and nothing here can change it
{
  const story = () => coach.locator(".storyimg").getAttribute("src");
  if (!/headline=Come\+train\+with\+me/.test(await story()))
    fail("Coaching should draw its own headline: " + (await story()));
  await pickHat(coach, "Going");
  if (!/headline=My\+week/.test(await story()))
    fail("Going should draw its own headline: " + (await story()));
  await pickHat(coach, "Coaching");
  await settled(coach);
}
console.log("the headline maps from the hat and offers no edit ok");

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
  if ((await coach.locator(".ps-event", { hasText: "Guns, Buns, and Lungs" }).count()) < 3)
    fail("hiding a class from the image removed it from the calendar");
}
console.log("the picker hides from the image only ok");

// ---- an empty range is an offer, not a blank picture. This has to run
// before the block below, which is the one that puts a class on this hat.
await coach.goto(BASE + "/share");
await coach.locator(".composer").waitFor();
{
  await pickHat(coach, "Going");
  await settled(coach);
  const cta = await coach.locator(".publishwrap .btn").first().innerText();
  if (!/Add something to your week/.test(cta)) fail("expected the offer, got " + cta);
  if ((await coach.locator(".publishwrap .btn").count()) !== 1)
    fail("an empty picture offers one button: the way to fill it");
}
console.log("an empty week offers rather than draws nothing ok");

// ---- adding from the picker: the editor is where calendars get kept
// current, so a class typed here has to land on the calendar and, when a
// studio was named, in that studio's catalog. That loop is the whole growth
// argument for this screen: somebody makes a picture, and the inventory fills
// in behind them.
{
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
  // Back on the editor, with the picture redrawn around it.
  await coach.locator(".storyimg").waitFor();
  await coach.waitForFunction(() => {
    const el = document.querySelector(".comprow-t");
    return el && /showing/.test(el.textContent || "");
  }, null, { timeout: 30000 });
  // It is on the calendar, not only on the image.
  await coach.goto(BASE + "/week");
  await coach.goto(BASE + "/app");
  await coach.locator(".caladd").waitFor();
  if (!(await coach.locator(".ps-event", { hasText: "Reformer Pilates" }).count()))
    fail("a class added from the editor should be on the calendar");
  // And the studio it named is findable, which is the inventory filling
  // itself in behind somebody making a picture. Studios left Discover, so the
  // surface that answers for them is the search every half lands in.
  await coach.goto(BASE + "/search");
  await coach.locator(".dissearch-in").first().fill("Asana");
  await coach.locator(".srchsec", { hasText: "STUDIOS" }).waitFor();
  if (!(await coach.locator(".disrow-studio", { hasText: "Asana Soul Practice" }).count()))
    fail("the studio named while adding should be findable");
}
console.log("adding from the picker fills the calendar and the directory ok");

// The editor is reachable above the breakpoint too, where the bar is gone: it
// hangs off the calendar's own Share button, which is on every width. A week
// with something on it, because an empty calendar drops its whole chrome and
// the Share button with it: you cannot make a picture of nothing.
await coach.setViewportSize({ width: 1280, height: 900 });
await coach.goto(BASE + "/app");
await coach.locator(".calshare").click();
await coach.waitForURL(/\/share/);
await coach.locator(".composer").waitFor();
console.log("the editor is reachable on desktop ok");
await coach.close();

// ---- a member has one hat, so the segment is gone rather than disabled
const member = await mk("sarah@example.com", "Sarah", true);
await member.goto(BASE + "/share");
await member.locator(".composer").waitFor();
await settled(member);
if (await member.locator(".share-toggles").count())
  fail("a member should not get a segment with one option in it");
{
  // Nor inside the sheet it moved to.
  await member.locator(".comprow").click();
  await member.locator(".sheet h2", { hasText: "Classes on your image" }).waitFor();
  if (await member.locator(".sheet .share-toggles").count())
    fail("a member should get no hat inside the classes sheet either");
  await member.locator(".sheet .sheetclose").first().click();
  await member.waitForTimeout(400);
}
if (!/headline=My\+week/.test(await member.locator(".storyimg").getAttribute("src")))
  fail("a member's picture should say My week");
{
  const cta = await member.locator(".publishwrap .btn").first().innerText();
  if (!/Add something to your week/.test(cta)) fail("an empty member should be offered: " + cta);
}
console.log("a member gets one hat and no segment ok");

await member.close();

await b.close();
console.log("SHARE OK");
