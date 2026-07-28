// A member signs up, claims a link, runs their own setup, and ends up with a
// public profile they can edit.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
//   node scripts/member-smoke.mjs
import { chromium } from "playwright";
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
await co.getByRole("button", { name: "Skip for now" }).click();
await co.getByRole("heading", { name: "Your week is empty" }).waitFor();
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
await p.getByRole("button", { name: "Finish setup" }).click();
await p.waitForURL("**/feed");
console.log("member setup ok (two steps, no studios, lands on their week)");

// the bottom bar is theirs too, minus Schedule: they have no week to teach
{
  const onFeed = (await p.locator(".navtab").allInnerTexts()).map((t) => t.trim());
  if (onFeed.join(",") !== "Following,Discover")
    fail(`a member's tabs should be Following and Discover, got ${onFeed.join(",")}`);
  await p.locator(".navtab", { hasText: "Discover" }).click();
  await p.waitForURL("**/discover");
  if ((await p.locator(".navtab").count()) !== 2) fail("the bar should follow them to Discover");
  await p.locator(".usericon").click();
  await p.waitForURL("**/you");
  if ((await p.locator(".navtab").count()) !== 2) fail("and to their account");
  if (await p.locator(".navtab.on").count())
    fail("the account is neither tab, so neither should be lit");
  await p.locator(".navtab", { hasText: "Following" }).click();
  await p.waitForURL("**/feed");
}
console.log("member tabs ok (Following and Discover, everywhere, no Schedule)");

// follow the coach so the profile has a "trains with"
await p.goto(BASE + "/carinacoach");
await p.locator(".followpill").click();
await p.locator(".followpill", { hasText: "Following" }).waitFor();

// the public profile
await p.goto(BASE + "/member");
await p.getByRole("heading", { name: "Mem Ber" }).waitFor();
if (!(await p.getByText("Lifts heavy, runs slow").count())) fail("tagline missing");
if (!(await p.getByText("Six mornings a week").count())) fail("bio missing");
if (!(await p.locator(".disrow", { hasText: "Carina" }).count()))
  fail("the coaches they follow should be on their profile");
if (await p.locator(".pubtab").count()) fail("a member has no schedule tabs");
await p.screenshot({ path: OUT + "/shot-member-profile.png", fullPage: true });
console.log("member profile ok (name, tagline, bio, who they train with)");

// and it's editable from the account
await p.goto(BASE + "/you");
await p.locator(".setrow", { hasText: "Edit your profile" }).click();
await p.getByRole("heading", { name: "Your profile" }).waitFor();
await p.locator("#meLoc").fill("Jersey City");
await p.screenshot({ path: OUT + "/shot-member-editor.png" });
await p.getByRole("button", { name: "Save profile" }).click();
await p.getByText("Profile saved").waitFor();
await p.goto(BASE + "/member");
await p.getByText("Jersey City").waitFor();
console.log("member profile edit ok");
await ctx.close();
await b.close();
console.log("MEMBER CHECKS PASSED");
