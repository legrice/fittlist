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
  await p.getByRole("heading", { name: "Your week is wide open" }).waitFor();
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
await m.waitForURL("**/week");
for (const n of names) {
  // Following moved off the list and onto the profile: the row gets you to a
  // person, and the pill by their name is where the follow happens.
  await m.goto(`${BASE}/discover`);
  // Classes lead the directory now; Coaches is one tap over.
  await m.locator(".dislist").waitFor();
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

await m.goto(BASE + "/week");
await m.locator(".tray").waitFor();
await m.waitForTimeout(500);

// the tabs, as header links, with the bottom bar gone
{
  await m.locator(".headnav").waitFor({ state: "visible" });
  const labels = await m.locator(".headnav-l").allInnerTexts();
  // Two, the same everyone gets; only where Schedule points differs. You is
  // the face in the corner on every width, so it is not one of these, and
  // Following went with the merged week it pointed at.
  if (labels.join("|") !== "Discover|Schedule")
    fail(`the header links should be Discover and Schedule, got ${labels}`);
  if (await m.locator(".navbar").isVisible()) fail("the bottom bar is still showing on a desktop width");
  if ((await m.locator(".headnav-l svg").count()) !== 0) fail("the header links have icons");
  const on = await m.locator(".headnav-l.on").innerText();
  if (on !== "Schedule") fail(`the lit link is "${on}", expected Schedule`);
  await m.locator(".headnav-l", { hasText: "Discover" }).click();
  await m.waitForURL(/\/discover/);
  await m.locator(".headnav-l.on", { hasText: "Discover" }).waitFor();
  await m.locator(".headnav-l", { hasText: "Schedule" }).click();
  await m.waitForURL(/\/week/);
  await m.locator(".headnav-l.on", { hasText: "Schedule" }).waitFor();
  // Deliberately no assertion on what the page holds here. This block is
  // about the links: where they go and which one lights. What arrives after a
  // client-side navigation is Next's business, and the header's <Link>
  // prefetches early enough that the payload can predate the follows below,
  // which made this fail about a third of the time for reasons that had
  // nothing to do with the header.
  console.log("header links navigate and light up ok");
}

// The tray survives a desktop width, with every face on it.
{
  await m.goto(BASE + "/week");
  await m.locator(".tray").waitFor();
  const faces = await m.locator(".trayitem").count();
  // Eight followed, plus the Add door at the end.
  if (faces !== 9) fail(`expected eight faces and the Add door, got ${faces}`);
  if (!(await m.locator(".trayitem", { hasText: "Add" }).count()))
    fail("the rail should end in the way to lengthen it");
  console.log("the tray carries every face on a desktop width ok");
}

// The rail's desktop arrows are gone with the rail that had them. The feed's
// coach strip carried .railarrow buttons, gated on (hover: hover) and
// (pointer: fine), so a mouse could walk a rail it could not swipe; the
// circles tray that replaced it scrolls but offers no such control. That is a
// real gap on a desktop width and it is written down in v4-brief-two.md
// rather than quietly dropped: the argument that produced those arrows still
// holds, the component they belonged to does not.

await b.close();
console.log("DESKTOP CHECKS PASSED");
