// A member signs up, claims a link, runs their own setup, and ends up with a
// public profile they can edit.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
//   node scripts/member-smoke.mjs
import { chromium } from "playwright";
import { fillLocation, skipSetup } from "./lib/wizard.mjs";
const BASE = "http://localhost:3000";
const OUT = process.env.SMOKE_OUT ?? ".";
const fail = (m) => { throw new Error("MEMBER FAIL: " + m); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

// a coach to follow, so the profile has something on it
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
await co.getByPlaceholder("Your name").fill("Carina Coach");
await co.getByRole("button", { name: "Claim it" }).click();
await skipSetup(co);
await co.getByRole("heading", { name: "Your week is wide open" }).waitFor();
// The two doors off an empty calendar are stacked, so they line up. They did
// not: the dashed empty state's own `.btn + .btn` rule is a three-class
// selector and pushed the second one 8px right, which is exactly the sort of
// misalignment you notice before you can name it.
{
  const box = (sel) => co.locator(sel).evaluate((e) => {
    const r = e.getBoundingClientRect();
    return { l: Math.round(r.left), w: Math.round(r.width) };
  });
  const first = await box(".calempty-cta .btn:first-child");
  const second = await box(".calempty-cta .btn:last-child");
  if (first.l !== second.l)
    fail(`the empty state's buttons should share a left edge: ${first.l} vs ${second.l}`);
  if (first.w !== second.w)
    fail(`the empty state's buttons should share a width: ${first.w} vs ${second.w}`);
}
await c1.close();
console.log("coach fixture ok");

const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
p.setDefaultTimeout(15000);
await p.goto(BASE + "/");
await p.getByRole("button", { name: "Sign up with email" }).click();
await p.locator(".roleseg button", { hasText: "here to train" }).click();
await p.getByPlaceholder("you@example.com").fill("mem@example.com");
await p.getByPlaceholder("Password").fill("member-pass-123");
await p.getByRole("button", { name: "Create account" }).click();
await p.getByRole("button", { name: "Not now" }).click().catch(() => {});

// a member is asked for a name and a link, same as a coach
await p.getByText("Pick your link.").waitFor();
if (!(await p.getByText("Your profile lives here").count()))
  fail("the claim copy should not promise a coach page to a member");
await p.screenshot({ path: OUT + "/shot-member-claim.png" });
await p.getByPlaceholder("Your name").fill("Mem Ber");
await p.getByRole("button", { name: "Claim it" }).click();

// their own setup: photo, then a bio. No studios.
await p.getByRole("heading", { name: "Add a photo." }).waitFor();
{
  const dots = await p.locator(".wizdot").count();
  if (dots !== 2) fail(`a member's setup should be two steps, got ${dots}`);
}
await p.screenshot({ path: OUT + "/shot-member-wiz1.png" });
await p.getByRole("button", { name: "Continue" }).click();
await p.getByRole("heading", { name: "Tell people who you are." }).waitFor();
if (await p.locator("#wInstagram").count()) fail("contact fields are a coach's");
await p.locator("#wTitle").fill("Lifts heavy, runs slow");
await p.locator("#wAbout").fill("Six mornings a week, mostly barbells.");
await p.screenshot({ path: OUT + "/shot-member-wiz2.png" });
await fillLocation(p);
await p.getByRole("button", { name: "Finish setup" }).click();
await p.waitForURL("**/feed");
console.log("member setup ok (two steps, no studios, lands on Following)");

// The same three tabs a coach gets. Only where Schedule points differs, and
// You is the header's face rather than a tab, because a person is not a
// place.
{
  const onFeed = (await p.locator(".navtab").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  if (onFeed.length !== 3) fail(`a member should get three tabs, got ${onFeed.join(",")}`);
  if (
    !onFeed[0].includes("Following") ||
    !onFeed[1].includes("Discover") ||
    !onFeed[2].includes("Schedule")
  )
    fail(`a member's tabs should be Following, Discover, Schedule, got ${onFeed.join(",")}`);
  if (!(await p.locator(".brandbar-actions .usericon").count()))
    fail("the header should carry the viewer's face as the way to You");
  if (await p.locator('.navtab[data-tab="home"]').count())
    fail("Home should be hidden from a member while it is admin-only");
  await p.locator(".navtab", { hasText: "Discover" }).click();
  await p.waitForURL(/\/discover/);
  if ((await p.locator(".navtab").count()) !== 3) fail("the bar should follow them to Discover");
  await p.locator(".navtab", { hasText: "Schedule" }).click();
  await p.waitForURL("**/week");
  if ((await p.locator(".navtab").count()) !== 3) fail("and to their own calendar");
  if ((await p.locator(".navtab.on").innerText()).includes("Schedule") === false)
    fail("their calendar should light the Schedule tab");
  // No plans ribbon, no gear, and no corner magnifier: Search is a tab.
  if (await p.locator(".plansbtn").count()) fail("the plans ribbon should be gone");
  if (await p.locator(".settingsbtn").count()) fail("the gear should be gone: You is the door");
  // The magnifier left the corner when Discover's tab took that glyph back:
  // the same mark is never drawn twice on one screen.
  if (await p.locator(".searchbtn").count())
    fail("the header magnifier should be gone: Discover's tab wears it");
  await p.locator(".brandbar-actions .usericon").click();
  await p.waitForURL("**/you");
  if ((await p.locator(".navtab").count()) !== 3) fail("and to their account rows");
  await p.locator(".navtab", { hasText: "Following" }).click();
  await p.waitForURL("**/feed");
}
console.log("member tabs ok (Following, Discover, Schedule, and You in the corner)");

// The chrome lives in a layout above the loading boundary, so a tab that's
// still loading keeps its header and its bar. Hold the response to see it.
{
  // times: 1 rather than unroute() later, which races the in-flight handler
  await p.route(
    "**/discover*",
    async (r) => {
      await new Promise((x) => setTimeout(x, 900));
      await r.continue();
    },
    { times: 1 },
  );
  await p.locator(".navtab", { hasText: "Discover" }).click();
  await p.waitForTimeout(350);
  const mid = await p.evaluate(() => ({
    tabs: document.querySelectorAll(".navtab").length,
    avatar: !!document.querySelector(".brandbar-actions .usericon"),
    lit: document.querySelector(".navtab.on")?.textContent?.trim() ?? null,
  }));
  if (mid.tabs !== 3) fail(`the bar unmounted while loading: ${JSON.stringify(mid)}`);
  if (!mid.avatar) fail(`the avatar unmounted while loading: ${JSON.stringify(mid)}`);
  if (mid.lit !== "Discover") fail(`the tapped tab should light up at once: ${JSON.stringify(mid)}`);
  await p.waitForURL(/\/discover/);
  await p.locator(".navtab", { hasText: "Following" }).click();
  await p.waitForURL("**/feed");
}
console.log("chrome survives the loading boundary ok");

// follow a coach, so there is something a profile could leak
await p.goto(BASE + "/carinacoach");
// The pill is a client component on a server-rendered page; clicking it before
// hydration lands on nothing at all.
await p.locator(".profacts .followpill").waitFor();
await p.waitForTimeout(400);
await p.locator(".profacts .followpill").click();
await p.locator(".profacts .followpill", { hasText: "Following" }).waitFor();

// the public profile: two tabs now, Schedule leading and Info holding the
// bio. This is the member on their own page, so the schedule shows their
// own state: the week they've built, or the note that adding fills it.
await p.goto(BASE + "/member");
await p.getByRole("heading", { name: "Mem Ber" }).waitFor();
if (!(await p.getByText("Lifts heavy, runs slow").count())) fail("tagline missing");
{
  const tabs = (await p.locator(".pubtab").allInnerTexts()).map((t) => t.trim());
  if (tabs.join("|") !== "Schedule|Info")
    fail("a member's page should wear Schedule and Info: " + tabs.join("|"));
}
await p.getByText(/Nothing coming up|Your week/).first().waitFor();
await p.locator(".pubtab", { hasText: "Info" }).click();
await p.waitForURL("**/member/about");
if (!(await p.getByText("Six mornings a week").count())) fail("bio missing from Info");
// Who they follow is nobody else's business. Two profiles side by side, one
// with six coaches and one with none, is a scoreboard nobody asked for.
if (await p.locator(".disrow", { hasText: "Carina" }).count())
  fail("a member's profile is listing the coaches they follow");
if (await p.getByText(/Trains with/i).count())
  fail("a member's profile still has the trains-with section");
await p.screenshot({ path: OUT + "/shot-member-profile.png", fullPage: true });
console.log("member profile ok (Schedule and Info tabs, nothing about who they follow)");


// A member claims a handle and has a page at it, so handing it on is theirs
// too: the three ways there are, and the invite card a coach gets.
{
  await p.goto(BASE + "/you");
  await p.locator(".setrow", { hasText: "Share profile" }).click();
  await p.locator(".sheet h2", { hasText: "Share" }).waitFor();
  for (const row of ["Copy link", "Profile card", "QR code"])
    await p.locator(".sheet .setrow", { hasText: row }).waitFor();
  await p.locator(".sheet .setrow", { hasText: "QR code" }).click();
  await p.locator(".qrimg").waitFor();
  await p.locator(".sheet .sheetclose").first().click();
  await p.waitForTimeout(400);

  // The renamed rows, both of which a coach's settings say the same way.
  await p.locator(".setrow", { hasText: "Handle" }).first().waitFor();
  if (await p.locator(".setrow", { hasText: "Your link" }).count()) {
    const t = await p.locator(".setrow", { hasText: "Your link" }).allInnerTexts();
    fail("the handle row should not still say Your link: " + JSON.stringify(t));
  }
  await p.locator(".setrow", { hasText: "Account privacy" }).first().waitFor();
  if (await p.locator(".setrow", { hasText: "Approve followers" }).count())
    fail("the privacy row should not still say Approve followers");

  await p.locator(".acctinvite", { hasText: "Share the love" }).waitFor();
  console.log("a member can hand their page on, and the wording matches a coach's ok");
}

// ---- the way out
//
// Both app stores require an account this app let somebody create to be
// deletable from inside it, and it is the one action here with no undo. Two
// steps, and the second asks for the word.
{
  await p.goto(BASE + "/you");
  await p.locator(".setrow", { hasText: "Delete account" }).click();
  await p.getByRole("heading", { name: "Delete your account" }).waitFor();
  const go = p.getByRole("button", { name: "Delete my account" });
  if (await go.isEnabled()) fail("the delete button should wait for the typed word");
  await p.locator("#delWord").fill("delete");
  if (!(await go.isEnabled())) fail("the typed word should arm the delete");
  // Not actually deleting: the rest of this suite needs the account. The gate
  // is what is being tested, and going through with it is covered where the
  // account is disposable.
  await p.getByRole("button", { name: "Keep my account" }).click();
  await p.waitForTimeout(400);
  console.log("delete account is offered, and asks twice ok");
}

// And the policy behind it is a real page, reachable without an account,
// because a privacy policy you have to sign in to read is not one.
{
  const anonCtx = await p.context().browser().newContext({ viewport: { width: 390, height: 844 } });
  const anon = await anonCtx.newPage();
  await anon.goto(BASE + "/privacy");
  await anon.getByRole("heading", { name: "Privacy", exact: true }).waitFor();
  const txt = await anon.locator(".pad").innerText();
  for (const must of ["What we hold", "Who can see what", "Delete it"])
    if (!txt.includes(must)) fail("the policy is missing a section: " + must);
  await anonCtx.close();
  console.log("the privacy policy is public ok");
}

// and it's editable from the account
await p.goto(BASE + "/you");
await p.locator(".setrow", { hasText: "Edit your profile" }).click();
await p.getByRole("heading", { name: "Your profile" }).waitFor();
// nothing to match against yet, so a bare city is refused rather than
// starting a second pill for a place that might already have one
await p.locator("#meLoc").fill("Hoboken");
await p.getByRole("button", { name: "Save profile" }).click();
await p.locator(".sheet .errorcopy", { hasText: /Add the state/ }).waitFor();
// any spelling lands on one canonical form
await p.locator("#meLoc").fill("jersey city new jersey");
await p.screenshot({ path: OUT + "/shot-member-editor.png" });
await p.getByRole("button", { name: "Save profile" }).click();
await p.getByText("Profile saved").waitFor();
// Same straggler as the /you arrival below: this goto rides right behind the
// save's refresh, and under suite load the load event has been seen to arrive
// after the timeout while the page itself is fine.
try {
  await p.goto(BASE + "/member");
} catch {
  console.log("goto /member straggled; retrying once");
  await p.goto(BASE + "/member");
}
// Scoped to the hero's own line: the coaches they train with carry cities too.
await p.locator(".pubhead .profwhere", { hasText: "Jersey City, NJ" }).waitFor();
console.log("member profile edit ok (location normalized to City, ST)");

// Now that Jersey City, NJ exists, a bare "Jersey City" joins it instead of
// making a second one. It's offered as a suggestion too.
// One retry: this arrival rides right behind a profile save's refresh, and
// under suite load the load event has been seen to straggle past the
// timeout while the page itself is fine. A second try that also hangs is a
// real failure.
try {
  await p.goto(BASE + "/you");
} catch {
  console.log("goto /you straggled; retrying once");
  await p.goto(BASE + "/you");
}
await p.locator(".setrow", { hasText: "Edit your profile" }).click();
await p.getByRole("heading", { name: "Your profile" }).waitFor();
{
  // the list is fetched on mount, so wait for it rather than racing it
  await p.locator("datalist option").first().waitFor({ state: "attached" });
  if (!(await p.locator("#meLoc").getAttribute("list")))
    fail("the location field should be wired to the suggestions");
  const opts = await p
    .locator("datalist option")
    .evaluateAll((els) => els.map((e) => e.getAttribute("value")));
  if (!opts.includes("Jersey City, NJ"))
    fail(`Jersey City, NJ should be suggested, got ${JSON.stringify(opts)}`);
}
await p.locator("#meLoc").fill("jersey city");
await p.getByRole("button", { name: "Save profile" }).click();
await p.getByText("Profile saved").waitFor();
await p.goto(BASE + "/member");
await p.locator(".pubhead .profwhere", { hasText: "Jersey City, NJ" }).waitFor();
console.log("bare city snaps to the one that exists ok");
await ctx.close();
await b.close();
console.log("MEMBER CHECKS PASSED");
