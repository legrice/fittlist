// Discover: the feed is everyone, the rail is the favorites, and a class
// is how you discover a coach. Replaces following-smoke, whose semantics
// (a follow fills the feed) this branch deliberately ended.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
//   node scripts/discover-smoke.mjs
import { chromium } from "playwright";
import { skipSetup } from "./lib/wizard.mjs";

const BASE = "http://localhost:3000";
const fail = (m) => { throw new Error("DISCOVER FAIL: " + m); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const stamp = Date.now().toString(36);

const mk = async (email, name, member) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(25000);
  await p.goto(BASE + "/");
  await p.getByRole("button", { name: "Sign up with email" }).click();
  await p.getByPlaceholder("you@example.com").fill(email);
  await p.getByPlaceholder("Password").fill("disc-pass-123");
  await p.getByRole("button", { name: "Create account" }).click();
  await p.getByRole("button", { name: "Not now" }).click().catch(() => {});
  await p.getByText("Pick your link.").waitFor();
  await p.getByPlaceholder("Your name").fill(name);
  await p.getByRole("button", { name: "Claim it" }).click();
  await skipSetup(p, "Jersey City, NJ", !member);
  if (member) await p.waitForURL("**/feed");
  return p;
};

// One coach, three Monday classes at one studio (the grouped row) and one
// Tuesday class (a plain row).
const coach = await mk(`dc${stamp}@example.com`, `Drew ${stamp.slice(-3)}`, false);
const addClass = async (nm, day, t, firstStudio) => {
  await coach.goto(BASE + "/calendar");
  await coach.locator(".wkempty-cta, .wkfab").first().click();
  await coach.locator(".stepline", { hasText: "Choose the studio" }).waitFor();
  if (firstStudio) {
    await coach.getByRole("button", { name: "+ New studio" }).click();
    await coach.getByPlaceholder("e.g. Palisade Barbell").fill(`Drew Gym ${stamp.slice(-3)}`);
    await coach.getByPlaceholder("e.g. 501 Palisade Ave, Jersey City").fill("1 Drew St, Jersey City NJ");
    await coach.getByRole("button", { name: "Add studio" }).click();
  } else {
    await coach.getByPlaceholder("Start typing a studio…").fill("Drew Gym");
    await coach.locator(".studio-row", { hasText: "Drew Gym" }).click();
    await coach.getByRole("button", { name: "+ New class" }).click();
  }
  await coach.getByPlaceholder("e.g. Barbell Strength").fill(nm);
  await coach.getByRole("button", { name: day, exact: true }).click();
  await coach.locator("#fStart").fill(t);
  await coach.locator(".publishwrap .btn").click();
  await coach.waitForTimeout(1200);
  await coach.locator(".sheetclose").first().click().catch(() => {});
};
await addClass("Dawn Lift", "Mo", "06:00", true);
await addClass("Noon Lift", "Mo", "12:00", false);
await addClass("Dusk Lift", "Mo", "18:00", false);
await addClass("Tuesday Flow", "Tu", "09:00", false);
console.log("coach's week up: three Mondays, one Tuesday");

// A brand-new member: Discover leads, the feed is full, the rail is ghosts.
const m = await mk(`dm${stamp}@example.com`, `Demi ${stamp.slice(-3)}`, true);
const tabs = (await m.locator(".navtab").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
if (!tabs[0].includes("Discover")) fail("Discover leads the bar: " + tabs.join("|"));
await m.locator(".trayhint").waitFor();
if ((await m.locator(".trayav-ghost").count()) !== 2) fail("a bare rail gets two ghosts");
await m.locator(".nearlbl", { hasText: "Upcoming classes" }).waitFor();
console.log("fresh member: full feed without a single favorite");

// The grouped row: three classes at one place on one day fold into one.
await m.getByText(/3 classes ·/).first().waitFor();
if (await m.getByText("Noon Lift").count()) fail("grouped classes must not also list singly");
console.log("a busy Monday folds into one row");

// A class is how you discover a coach: the peek's star favorites them.
await m.getByText("Tuesday Flow").first().click();
await m.locator(".peekstar").waitFor();
if (await m.locator(".peekstar.on").count()) fail("the star starts empty");
await m.locator(".peekstar").click();
await m.locator(".peekstar.on").waitFor();
console.log("starred from the class");

// The face lands on the rail, and tapping it opens the fortnight with the
// star already filled and Save on the rows.
await m.goto(BASE + "/feed");
await m.locator(".trayitem", { hasText: "Drew" }).waitFor();
await m.locator(".trayitem", { hasText: "Drew" }).click();
await m.locator(".peeksheet .peekhead-nm", { hasText: "Drew" }).waitFor();
await m.locator(".peeksheet .peekstar.on").waitFor();
await m.locator(".peeksheet button", { hasText: "Save" }).first().click();
await m.locator(".peeksheet button", { hasText: "Saved" }).first().waitFor();
console.log("the face opens the fortnight; saving marks from the peek");

// Unstar from the peek head takes the face off the rail on close.
await m.locator(".peeksheet .peekstar").click();
await m.locator(".peeksheet .peekstar:not(.on)").waitFor();
await m.locator(".peekclose").click();
await m.locator(".trayitem", { hasText: "Drew" }).waitFor({ state: "detached", timeout: 15000 });
console.log("unstar clears the rail on close");

await b.close();
console.log("ALL DISCOVER CHECKS PASSED");
