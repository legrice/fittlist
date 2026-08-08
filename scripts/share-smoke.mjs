// The composer: a picture of your week, and the three questions that make it.
//
// It is the one screen whose whole job is making something worth sending, so
// what this walks is the making: that the preview is a real PNG at the poster's
// own proportions, that the three rows say where they stand, that the sixteen
// colorways are sixteen, that the picker's count and the picture agree, that adding a
// class from the picker reaches the calendar and the studio directory, and that
// an empty range is an offer rather than a blank image.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
//   node scripts/share-smoke.mjs
import { chromium } from "playwright";
import { skipSetup } from "./lib/wizard.mjs";

const BASE = "http://localhost:3000";
const fail = (m) => { throw new Error("SHARE FAIL: " + m); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

/** One of the three rows, by its heading. */
const row = (p, name) => p.locator(".comprow", { hasText: name });
const rowWords = async (p, name) => (await row(p, name).innerText()).replace(/\s+/g, " ").trim();

const openSheet = async (p, name, heading) => {
  await row(p, name).click();
  await p.locator(".sheet h2", { hasText: heading }).waitFor();
};
const closeSheet = async (p) => {
  await p.locator(".sheet .publishwrap .btn", { hasText: "Done" }).click();
  await p.locator(".sheet-scrim").waitFor({ state: "detached", timeout: 10000 });
};

/** The Classes row reads "Loading" until the rows are in, so anything reading
 *  the count has to wait for a settled value rather than for "Loading" to be
 *  absent: changing the range resets the rows, and a check for the absence can
 *  pass against the previous load's answer in the frame before React clears it. */
const settled = (p) =>
  p.waitForFunction(() => {
    // Any of the three sub-lines, not the first: the Dates row leads now and
    // querySelector would keep answering with its range forever.
    return [...document.querySelectorAll(".comprow-t small")].some((el) =>
      /showing|Nothing/.test(el.textContent || ""),
    );
  }, null, { timeout: 30000 });

const drawn = (p) =>
  p.waitForFunction(() => {
    const i = document.querySelector(".composer > .storyimg-wrap .storyimg");
    return i && i.complete && i.naturalWidth > 0;
  }, null, { timeout: 30000 });

const mk = async (email, name, member) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(20000);
  await p.goto(BASE + "/");
  await p.getByRole("button", { name: "Sign up with email" }).click();
  await p.getByPlaceholder("you@example.com").fill(email);
  await p.getByPlaceholder("Password").fill("share-pass-123");
  await p.getByRole("button", { name: "Create account" }).click();
  await p.getByRole("button", { name: "Not now" }).click().catch(() => {});
  await p.getByText("Pick your link.").waitFor();
  await p.getByPlaceholder("Your name").fill(name);
  await p.getByRole("button", { name: "Claim it" }).click();
  await skipSetup(p, "Jersey City, NJ", !member);
  if (member) await p.waitForURL("**/feed");
  return p;
};

// ---- a coach with a real week
const coach = await mk("carina@example.com", "Carina Clores", false);
await coach.goto(BASE + "/calendar");
await coach.locator(".wkempty-cta, .wkfab").first().click();
// The stepped adder: studio first (a brand-new one lands straight on the
// form), then the class details and the times.
await coach.locator(".stepline", { hasText: "Choose the studio" }).waitFor();
await coach.getByRole("button", { name: "+ New studio" }).click();
await coach.getByPlaceholder("e.g. Palisade Barbell").fill("Ironbound Performance Athletics");
await coach
  .getByPlaceholder("e.g. 501 Palisade Ave, Jersey City")
  .fill("424 Eagle Rock Ave, West Orange NJ");
await coach.getByRole("button", { name: "Add studio" }).click();
await coach.getByPlaceholder("e.g. Barbell Strength").fill("Guns, Buns, and Lungs");
for (const d of ["Mo", "We", "Fr"])
  await coach.getByRole("button", { name: d, exact: true }).click();
await coach.locator(".publishwrap .btn").click();
await coach.waitForTimeout(1300);
await coach.locator(".sheetclose").first().click().catch(() => {});
console.log("a coach put a week up ok");

// ---- Share is a tab in the bar, and the hub behind it reaches the editor
await coach.goto(BASE + "/calendar");
await coach.locator(".clline").first().waitFor();
{
  const tabs = (await coach.locator(".navtab").allInnerTexts()).map((t) =>
    t.replace(/\s+/g, " ").trim(),
  );
  // Share is a tab now, by Matt's call: it is the half of "build a calendar,
  // share a calendar" the app is for, and the tab opens the hub of every way
  // to do it rather than navigating.
  if (!tabs.some((t) => /Share/.test(t))) fail("Share should be a tab: " + tabs.join("|"));
  if (await coach.locator(".wkshare").count()) fail("the floating Share pill should be gone");
}
await coach.locator('.navtab[data-tab="share"]').click();
await coach.waitForURL(/\/coachshare/);
if (await coach.locator(".shedit").count()) fail("the hub should carry no editor link");
// The composer survives at its route with nothing linking to it; the rest
// of this suite holds it there so it cannot rot unnoticed.
await coach.goto(BASE + "/share");
await coach.locator(".composer").waitFor();
await coach.locator(".adderhead h2", { hasText: "Share your schedule" }).waitFor();
// It opens over the app: no bar underneath competing with it.
if (await coach.locator(".navbar:visible").count())
  fail("the editor should cover the tab bar, not sit above it");
console.log("the Share tab's hub opens the editor ok");

// ---- three questions, in one scroll, each saying where it stands
await settled(coach);
{
  if (await coach.locator(".comptab").count())
    fail("the collapsing drawer is gone: the editor is one scroll");
  if (await coach.locator(".compfmt").count())
    fail("the Story/Square picker should be gone: the editor makes a story");
  if (await coach.locator("#stHeadline").count()) fail("the headline field should be gone");
  // The hats are gone with going marks: one week to draw, so a segment here
  // would be a control with one option.
  if (await coach.locator(".share-toggles").count())
    fail("the Coaching/Going segment should be gone entirely");
  const heads = (await coach.locator(".comprow-t").allInnerTexts()).map((t) =>
    t.split("\n")[0].trim(),
  );
  console.log("rows:", heads.join(" | "));
  if (heads.join() !== "Dates,Classes,Color")
    fail("expected Dates, Classes, Color, got " + heads.join());
  // The questions sit above the picture they change. They were under it,
  // which reads as a caption on the poster rather than as the controls that
  // make it: on a phone the poster is most of the screen, so the answer was
  // what you saw and the questions were what you scrolled for.
  const optY = (await coach.locator(".storycustom").boundingBox()).y;
  const picY = (await coach.locator(".composer > .storyimg-wrap").boundingBox()).y;
  if (!(optY < picY)) fail("the options belong above the preview");
  if (!/All 3 showing/.test(await rowWords(coach, "Classes")))
    fail("the Classes row should count what is on the picture: " + (await rowWords(coach, "Classes")));
}
console.log("one scroll, three rows, no hat ok");

// ---- the preview is a real 1080x1920 story at 9:16
await drawn(coach);
{
  const [w, h] = await coach
    .locator(".composer > .storyimg-wrap .storyimg")
    .evaluate((i) => [i.naturalWidth, i.naturalHeight]);
  if (w !== 1080 || h !== 1920) fail(`a story should be 1080x1920, got ${w}x${h}`);
  // The composer is a fixed-height flex column, so the preview is a flex item
  // on the main axis and gets squashed to make the screen add up unless it
  // refuses to shrink. Twice this shipped as a near-square nothing explained.
  const box = await coach.locator(".composer > .storyimg-wrap").boundingBox();
  const ratio = box.height / box.width;
  if (Math.abs(ratio - 16 / 9) > 0.06)
    fail(`the preview should be 9:16, got ${box.width}x${box.height} (${ratio.toFixed(2)})`);
}
// The square canvas is still drawn by the route, and nothing in the app asks
// for one. Held here so the second format cannot rot while it waits for a
// control to offer it again.
{
  const r = await coach.request.get(`${BASE}/api/story/compose?fmt=square`);
  if (!r.ok()) fail("the square canvas should still render at the route");
  const buf = await r.body();
  // PNG: width and height are big-endian 32-bit at byte 16 and 20.
  if (buf.readUInt32BE(16) !== 1080 || buf.readUInt32BE(20) !== 1080)
    fail("the square route should be 1080x1080");
}
console.log("one canvas offered, and the square still renders at the route ok");

// ---- sixteen colorways, and color is the whole of the look
{
  await openSheet(coach, "Color", "Color");
  const cards = await coach.locator(".paldot").count();
  console.log("colorways:", cards);
  if (cards !== 16) fail("expected sixteen colors, got " + cards);
  // A rail, not a grid: the whole point is that the poster stays on screen
  // while you swipe through, so the sixteen have to fit one scrolling row.
  const rail = coach.locator(".palrail");
  const over = await rail.evaluate((e) => e.scrollWidth - e.clientWidth);
  const tops = await coach
    .locator(".paldot")
    .evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size);
  if (tops !== 1) fail("the colors should sit on one row, got " + tops + " rows");
  if (over <= 0) fail("sixteen on one row should scroll sideways");
  // ...and the poster is still in view with the rail on screen.
  const peekBox = await coach.locator(".stylepeek").boundingBox();
  const railBox = await rail.boundingBox();
  if (peekBox.y + peekBox.height > railBox.y + 4)
    fail("the preview should sit whole above the rail");
  // The style axis is gone. Ten arrangements were not different enough to be
  // worth a decision, and a picker asking about a difference nobody can see is
  // a sheet and a grid spent on nothing.
  if (await coach.locator(".stylecard, .stylegrid").count())
    fail("the style grid should be gone");

  // Every swatch is a different ground: two that looked the same would be two
  // rows in a picker doing one row's work.
  const grounds = await coach
    .locator(".paldot-c")
    .evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundImage + getComputedStyle(e).backgroundColor));
  if (new Set(grounds).size !== 16)
    fail(`the sixteen collapse to ${new Set(grounds).size} grounds`);

  // The real poster is in the sheet and redraws as you pick, at the poster's
  // own proportions. It used to live behind the scrim, which meant choosing
  // blind, closing, looking, and opening again.
  const peek = coach.locator(".stylepeek .storyimg");
  await peek.waitFor();
  {
    const box = await coach.locator(".stylepeek .storyimg-wrap").boundingBox();
    const ratio = box.height / box.width;
    if (Math.abs(ratio - 16 / 9) > 0.08)
      fail(`the sheet's preview should be 9:16, got ${ratio.toFixed(2)}`);
  }
  const before = await peek.getAttribute("src");
  await coach.locator(".paldot", { hasText: "Cobalt" }).click();
  await coach.waitForTimeout(400);
  if ((await peek.getAttribute("src")) === before)
    fail("picking a color should redraw the poster in the sheet");
  const src = await peek.getAttribute("src");
  console.log("picture:", src.replace(/^.*compose\?/, ""));
  if (!/theme=cobalt/.test(src)) fail("the picture should carry the color: " + src);
  // Every one of the sixteen actually draws. A colorway is four colors and a
  // lockup choice, and a bad hex in any of them is a 500 from Satori that the
  // swatch grid cannot show you: the swatch is CSS and the poster is not.
  {
    const ids = await coach.locator(".paldot").evaluateAll((els) =>
      els.map((e) => e.querySelector(".paldot-lbl").textContent.trim().toLowerCase()),
    );
    for (const label of ids) {
      const r = await coach.request.get(
        `${BASE}/api/story/compose?theme=${encodeURIComponent(label)}&days=7`,
      );
      if (!r.ok()) fail(`${label} does not render: ${r.status()}`);
      const buf = await r.body();
      if (buf.readUInt32BE(16) !== 1080 || buf.readUInt32BE(20) !== 1920)
        fail(`${label} drew the wrong size`);
    }
    console.log("all sixteen draw:", ids.join(" "));
  }
  await closeSheet(coach);
  const words = await rowWords(coach, "Color");
  console.log("color row:", words);
  if (!words.includes("Cobalt")) fail("the Color row should name it: " + words);
  await drawn(coach);
}
console.log("sixteen colorways, and no second question ok");

// ---- the range picker is back: a start day and a length
{
  await openSheet(coach, "Dates", "Dates");
  const startCount = await coach.locator(".daychip").count();
  if (startCount !== 14) fail("a fortnight of start days, got " + startCount);
  if ((await coach.locator(".lenchip").count()) !== 7)
    fail("one to seven days, got " + (await coach.locator(".lenchip").count()));
  // One day is the floor, because "I'm at this tonight" is a real post.
  await coach.locator(".lenchip", { hasText: "1" }).first().click();
  await coach.waitForTimeout(400);
  await closeSheet(coach);
  await settled(coach);
  const src = await coach.locator(".composer > .storyimg-wrap .storyimg").getAttribute("src");
  if (!/days=1/.test(src)) fail("the picture should draw the range asked for: " + src);
  const dates = await rowWords(coach, "Dates");
  console.log("one day:", dates);
  if (/ to /.test(dates)) fail("a single day names itself rather than both ends: " + dates);
  // Back to a week.
  await openSheet(coach, "Dates", "Dates");
  await coach.locator(".lenchip", { hasText: "7" }).first().click();
  await coach.waitForTimeout(400);
  await closeSheet(coach);
  await settled(coach);
  if (!/ to /.test(await rowWords(coach, "Dates"))) fail("a range names both ends");
}
console.log("the range picker covers a day to a week ok");

// ---- the picker counts what is on the image, and hiding is not deleting
{
  if (!/All 3 showing/.test(await rowWords(coach, "Classes")))
    fail("expected all three back: " + (await rowWords(coach, "Classes")));
  await openSheet(coach, "Classes", "Classes on your image");
  if (!/stays on your calendar/i.test(await coach.locator(".compnote").innerText()))
    fail("the sheet has to say that unchecking is not deleting");
  await coach.locator(".sheet .setrow").first().click();
  await closeSheet(coach);
  await coach.waitForTimeout(600);
  if (!/2 of 3 showing/.test(await rowWords(coach, "Classes")))
    fail("hiding one should count: " + (await rowWords(coach, "Classes")));
  // And the class is still on the calendar it was hidden from.
  await coach.goto(BASE + "/calendar");
  await coach.locator(".clline").first().waitFor();
  if (!(await coach.locator(".clline-nm", { hasText: "Guns, Buns, and Lungs" }).count()))
    fail("hiding a class from the image removed it from the calendar");
}
console.log("the picker hides from the image only ok");

// ---- adding from the picker: the editor is where calendars get kept
// current, so a class typed here has to land on the calendar and, when a
// studio was named, in that studio's catalog. That loop is the whole growth
// argument for this screen: somebody makes a picture, and the inventory fills
// in behind them.
await coach.goto(BASE + "/share");
await coach.locator(".composer").waitFor();
await settled(coach);
{
  await openSheet(coach, "Classes", "Classes on your image");
  if (!/added to your calendar too/i.test(await coach.locator(".compnote").innerText()))
    fail("the sheet has to say an add reaches the calendar, not just the picture");
  await coach.locator(".compadd").click();
  // The composer's coaching add walks the same steps.
  await coach.locator(".stepline", { hasText: "Choose the studio" }).waitFor();
  await coach.getByRole("button", { name: "+ New studio" }).click();
  await coach.getByPlaceholder("e.g. Palisade Barbell").fill("Asana Soul Practice");
  await coach
    .getByPlaceholder("e.g. 501 Palisade Ave, Jersey City")
    .fill("124 1st St, Jersey City, NJ");
  await coach.getByRole("button", { name: "Add studio" }).click();
  await coach.locator("#fName").waitFor();
  await coach.locator("#fName").fill("Reformer Pilates");
  for (const d of ["Tu", "Th"])
    await coach.getByRole("button", { name: d, exact: true }).click();
  await coach.locator(".publishwrap .btn").last().click();
  await coach.waitForTimeout(1400);
  await coach.locator(".sheetclose").first().click().catch(() => {});
  // It is on the calendar, not only on the image.
  await coach.goto(BASE + "/calendar");
  await coach.locator(".clline").first().waitFor();
  if (!(await coach.locator(".clline-nm", { hasText: "Reformer Pilates" }).count()))
    fail("a class added from the editor should be on the calendar");
  // And the studio it named is findable, which is the inventory filling
  // itself in behind somebody making a picture.
  await coach.goto(BASE + "/search");
  await coach.locator(".dissearch-in").first().fill("Asana");
  await coach.locator(".srchsec", { hasText: "STUDIOS" }).waitFor();
  if (!(await coach.locator(".disrow-studio", { hasText: "Asana Soul Practice" }).count()))
    fail("the studio named while adding should be findable");
}
console.log("adding from the picker fills the calendar and the directory ok");

// ---- an empty range is an offer, not a blank picture. A week eight weeks out
// holds nothing, and the picture says so with the way to fix it.
await coach.goto(BASE + "/share");
await coach.locator(".composer").waitFor();
await settled(coach);
{
  await openSheet(coach, "Dates", "Dates");
  // The rail ends at a fortnight, so the emptiest reachable start is its last
  // day with a one-day range: this coach teaches Mon/Wed/Fri and Tue/Thu, so
  // whichever weekday that lands on, one of the two runs. Delete the classes
  // instead, which is the honest empty and the state a new coach is in.
  await closeSheet(coach);
  await coach.goto(BASE + "/calendar");
  await coach.locator(".clline").first().waitFor();
  for (const nm of ["Guns, Buns, and Lungs", "Reformer Pilates"]) {
    await coach.locator(".clline", { hasText: nm }).first().click();
    await coach.locator(".clspeek").waitFor();
    await coach.locator(".clspeek-del").click();
    await coach.locator(".confirmsheet").waitFor();
    await coach.locator(".confirmsheet .btn.si").click();
    // Every date of it goes, so wait for the count to reach nought rather than
    // for one node: a weekly class is three rows in a week.
    await coach.waitForFunction(
      (t) => ![...document.querySelectorAll(".clline-nm")].some((e) => e.textContent === t),
      nm,
      { timeout: 15000 },
    );
  }
  await coach.goto(BASE + "/share");
  await coach.locator(".composer").waitFor();
  await settled(coach);
  const cta = await coach.locator(".publishwrap .btn").first().innerText();
  if (!/Add a class you coach/.test(cta)) fail("expected the offer, got " + cta);
  if ((await coach.locator(".publishwrap .btn").count()) !== 1)
    fail("an empty picture offers one button: the way to fill it");
}
console.log("an empty week offers rather than draws nothing ok");
await coach.close();

// ---- a member's composer draws their week now: marks and dated entries
const member = await mk("sarah@example.com", "Sarah", true);
await member.goto(BASE + "/share");
await member.waitForURL(/\/feed/);
{
  // And the URL is not a way round it either.
  const r = await member.request.get(`${BASE}/api/story/compose`);
  if (r.status() !== 200) fail("the image route draws a member's week now, got " + r.status());
}
console.log("a member's week draws from the same route ok");

await member.close();
await b.close();
console.log("SHARE OK");
