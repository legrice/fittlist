// Invite-only beta gate. Run the server with the DEFAULT env (INVITE_ONLY on).
// Verifies: a stranger can't sign up but can request an invite, an admin sees
// the request and can invite (by request or by email), and invited emails can
// then sign up.
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const OUT = process.env.SMOKE_OUT ?? ".";
const fail = (m) => { throw new Error("INVITE SMOKE FAIL: " + m); };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

// 1) A non-invited email is blocked, then requests an invite via the modal.
const ctx1 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p1 = await ctx1.newPage();
p1.setDefaultTimeout(15000);
await p1.goto(BASE + "/");
await p1.getByRole("button", { name: "Sign up with email" }).click();
if (!(await p1.getByText("Invite-only beta").isVisible())) fail("signup sheet should note invite-only");
await p1.getByPlaceholder("you@example.com").fill("stranger@example.com");
await p1.getByPlaceholder("Password").fill("stranger-pass-123");
await p1.getByRole("button", { name: "Create account" }).click();
// wait for the ERROR, not the lead copy — the lead already says "invite-only",
// so matching on that returns while the transition is still re-rendering
await p1.locator(".sheet .errorcopy", { hasText: /invite-only/i }).waitFor();
console.log("non-invited signup blocked ok");

// open the request-an-invite modal from the signup sheet
await p1.locator(".sheet .authmagic", { hasText: "Request an invite" }).click();
await p1.getByRole("heading", { name: "Request an invite" }).waitFor();
await p1.getByPlaceholder("Your name").fill("Riley Requestor");
await p1.locator(".sheet input[type=email]").fill("riley@example.com");
await p1.screenshot({ path: OUT + "/shot-request-modal.png" });
await p1.locator(".sheet").getByRole("button", { name: "Request an invite", exact: true }).click();
await p1.locator(".sheet h2", { hasText: "on the list" }).waitFor();
await p1.screenshot({ path: OUT + "/shot-request-sent.png" });
console.log("request-an-invite submitted ok");
await ctx1.close();

// 2) Admin sees the request and invites from it; also invites a coach by email.
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const admin = await ctx2.newPage();
admin.setDefaultTimeout(15000);
await admin.goto(BASE + "/");
await admin.getByRole("button", { name: "Sign up with email" }).click();
await admin.getByPlaceholder("you@example.com").fill("mattlegrice@gmail.com");
await admin.getByPlaceholder("Password").fill("admin-pass-123");
await admin.getByRole("button", { name: "Create account" }).click();
await admin.getByRole("button", { name: "Not now" }).click().catch(() => {});
await admin.getByText("Pick your link.").waitFor();
await admin.getByPlaceholder("Your name").fill("Matt Admin");
await admin.getByRole("button", { name: "Claim it" }).click();
await admin.getByRole("heading", { name: "Add a photo." }).waitFor();
await admin.getByRole("button", { name: "Skip for now" }).click();
await admin.getByRole("heading", { name: "Your week is empty" }).waitFor();

await admin.goto(BASE + "/admin");
await admin.getByRole("heading", { name: "Admin" }).waitFor();
await admin.getByRole("button", { name: "Invites", exact: true }).click();
// the request from Riley shows in the Requests section
const reqCard = admin.locator(".admincard", { hasText: "Riley Requestor" });
await reqCard.waitFor();
await admin.screenshot({ path: OUT + "/shot-admin-requests.png", fullPage: true });
await reqCard.getByRole("button", { name: "Invite", exact: true }).click();
await admin.locator(".admincard", { hasText: "riley@example.com" }).getByText("pending").waitFor();
console.log("admin invited from request ok");
// invite another coach directly by email
await admin.getByPlaceholder("coach@example.com").fill("coach2@example.com");
await admin.getByRole("button", { name: "Invite & email link" }).click();
await admin.locator(".adminlink input").waitFor();
console.log("admin invited by email ok");
await ctx2.close();

// 3) Both invited emails can now sign up.
for (const em of ["riley@example.com", "coach2@example.com"]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  pg.setDefaultTimeout(15000);
  await pg.goto(BASE + "/");
  await pg.getByRole("button", { name: "Sign up with email" }).click();
  await pg.getByPlaceholder("you@example.com").fill(em);
  await pg.getByPlaceholder("Password").fill("invited-pass-123");
  await pg.getByRole("button", { name: "Create account" }).click();
  await pg.getByRole("button", { name: "Not now" }).click().catch(() => {});
  await pg.getByText("Pick your link.").waitFor();
  console.log(`invited signup ok: ${em}`);
  await ctx.close();
}

// 4) Members are in the beta too. With FANS_ENABLED=true the signup sheet
// offers "I'm here to train", and that path goes through the same invite gate
// the coaches do — everyone is in beta until the beta ends. Skipped when the
// flag is dark, since the toggle isn't rendered.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  pg.setDefaultTimeout(15000);
  await pg.goto(BASE + "/");
  await pg.getByRole("button", { name: "Sign up with email" }).click();
  const roleToggle = pg.locator(".roleseg button", { hasText: "here to train" });
  if (await roleToggle.count()) {
    // a non-invited member is turned away exactly like a non-invited coach
    await roleToggle.click();
    await pg.getByPlaceholder("you@example.com").fill("member@example.com");
    await pg.getByPlaceholder("Password").fill("member-pass-123");
    await pg.getByRole("button", { name: "Create account" }).click();
    await pg.locator(".sheet .errorcopy", { hasText: /invite-only/i }).waitFor();
    if (pg.url().includes("/feed")) fail("a non-invited member should not get an account");
    console.log("non-invited member signup blocked ok");

    // invite them (as admin), then the same signup goes through
    const actx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const ad = await actx.newPage();
    ad.setDefaultTimeout(15000);
    await ad.goto(BASE + "/");
    await ad.locator(".obloginlink", { hasText: "Already have an account" }).click();
    await ad.getByPlaceholder("you@example.com").fill("mattlegrice@gmail.com");
    await ad.getByPlaceholder("Password").fill("admin-pass-123");
    await ad.locator(".sheet").getByRole("button", { name: "Log in", exact: true }).click();
    await ad.getByRole("button", { name: "Not now" }).click().catch(() => {});
    await ad.goto(BASE + "/admin");
    await ad.getByRole("button", { name: "Invites", exact: true }).click();
    await ad.getByPlaceholder("coach@example.com").fill("member@example.com");
    await ad.getByRole("button", { name: "Invite & email link" }).click();
    await ad.locator(".adminlink input").waitFor();
    await actx.close();
    console.log("admin invited a member ok");

    await pg.reload();
    await pg.getByRole("button", { name: "Sign up with email" }).click();
    await pg.locator(".roleseg button", { hasText: "here to train" }).click();
    await pg.getByPlaceholder("you@example.com").fill("member@example.com");
    await pg.getByPlaceholder("Password").fill("member-pass-123");
    await pg.getByRole("button", { name: "Create account" }).click();
    // invited: no handle claim, straight to their week
    await pg.waitForURL("**/feed");
    await pg.getByText("Nobody yet").waitFor();
    console.log("invited member signup ok");

    // 5) And a member can become a coach later without a second invite: the
    // account offers it, the claim runs the same flow, and they land in setup.
    await pg.goto(BASE + "/you");
    await pg.locator(".memberid").waitFor();
    await pg.locator(".setrow", { hasText: "Post your own classes" }).click();
    await pg.getByRole("heading", { name: "Post your own classes" }).waitFor();
    await pg.locator("#scName").fill("Member Turned Coach");
    await pg.locator("#scHandle").fill("membercoach");
    await pg.getByRole("button", { name: "Claim it" }).click();
    // straight into the setup wizard, never the invite wall
    await pg.getByRole("heading", { name: "Add a photo." }).waitFor();
    await pg.getByRole("button", { name: "Skip for now" }).click();
    await pg.getByRole("heading", { name: "Your week is empty" }).waitFor();
    // and their page is live at the link they picked
    const claimed = await pg.request.get(`${BASE}/membercoach`);
    if (!claimed.ok()) fail("the claimed page should be live");
    console.log("member -> coach ok (no invite, lands in setup)");
  } else {
    console.log("member signup skipped — FANS_ENABLED is not true");
  }
  await ctx.close();
}

// 6) Landing from a beta invite reads as "you're in", and never asks someone
// holding an invite to queue for one. Organic landings still get the queue.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  pg.setDefaultTimeout(15000);

  await pg.goto(BASE + "/");
  if (!(await pg.locator(".obloginlink", { hasText: "Request an invite" }).count()))
    fail("an organic landing should offer the invite queue");
  if (await pg.locator(".invitetag").count()) fail("no invite, no you're-in tag");

  await pg.goto(BASE + "/?invited=1");
  await pg.locator(".invitetag", { hasText: "You’re in" }).waitFor();
  await pg.getByText("Welcome to the").waitFor();
  if (await pg.locator(".obloginlink", { hasText: "Request an invite" }).count())
    fail("someone holding an invite has nothing to request");
  await pg.screenshot({ path: OUT + "/shot-invited-landing.png" });
  await pg.getByRole("button", { name: "Claim your invite" }).click();
  await pg.getByRole("heading", { name: "Claim your invite" }).waitFor();
  if (await pg.locator(".sheet .authmagic", { hasText: "Request an invite" }).count())
    fail("the signup sheet should drop the queue for an invited visitor");
  if (await pg.getByText("Invite-only beta").count())
    fail("don't gate-keep at someone who is already through the gate");
  await pg.screenshot({ path: OUT + "/shot-invited-sheet.png" });
  console.log("invited landing ok (you're in, no invite queue)");

  // a dead invite link still lands them on the invited copy, not the queue
  await pg.goto(BASE + "/auth/magic?token=" + "0".repeat(64) + "&invited=1");
  await pg.locator(".invitetag").waitFor();
  if (!(await pg.locator(".errorcopy", { hasText: /expired/i }).count()))
    fail("an expired link should say so");
  console.log("expired invite link keeps its invited framing ok");
  await ctx.close();
}

// 7) Beta users bring the next beta users in, and the admin can see who
// brought whom — the whole point of letting them invite at all.
{
  // riley signs in (invited in step 2) and invites someone of their own
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  pg.setDefaultTimeout(15000);
  await pg.goto(BASE + "/");
  await pg.locator(".obloginlink", { hasText: "Already have an account" }).click();
  await pg.getByPlaceholder("you@example.com").fill("riley@example.com");
  await pg.getByPlaceholder("Password").fill("invited-pass-123");
  await pg.locator(".sheet").getByRole("button", { name: "Log in", exact: true }).click();
  await pg.getByRole("button", { name: "Not now" }).click().catch(() => {});
  await pg.getByText("Pick your link.").waitFor();
  await pg.getByPlaceholder("Your name").fill("Riley Requestor");
  await pg.getByRole("button", { name: "Claim it" }).click();
  await pg.getByRole("button", { name: "Skip for now" }).click();
  await pg.getByRole("heading", { name: "Your week is empty" }).waitFor();

  await pg.locator(".usericon").click();
  await pg.locator(".acctwrap").waitFor();
  await pg.waitForTimeout(450); // the account slides up; clicking mid-flight misses
  const row = pg.locator(".setrow", { hasText: "Invite someone to the beta" });
  // centre it rather than letting scrollIntoViewIfNeeded park it under the tabs
  await row.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await row.locator(".s", { hasText: "invites left" }).waitFor();
  await row.click();
  await pg.getByRole("heading", { name: "Invite someone to the beta" }).waitFor();
  // an email that's already here doesn't burn an invite
  await pg.locator("#ivEmail").fill("mattlegrice@gmail.com");
  await pg.getByRole("button", { name: "Send the invite" }).click();
  await pg.locator(".sheet .errorcopy", { hasText: /already have a fittlist account/ }).waitFor();
  await pg.locator("#ivEmail").fill("friendofriley@example.com");
  await pg.locator("#ivNote").fill("Coaches at Ironbound");
  await pg.getByRole("button", { name: "Send the invite" }).click();
  await pg.getByText("Invite sent to friendofriley@example.com").waitFor();
  // the count comes down
  await row.locator(".s").waitFor();
  await pg.screenshot({ path: OUT + "/shot-invite-friend.png", fullPage: true });
  console.log("beta user invited a friend ok");
  await ctx.close();

  // that invite works, and lands the same way ours does
  const fctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const fp = await fctx.newPage();
  fp.setDefaultTimeout(15000);
  await fp.goto(BASE + "/");
  await fp.getByRole("button", { name: "Sign up with email" }).click();
  await fp.getByPlaceholder("you@example.com").fill("friendofriley@example.com");
  await fp.getByPlaceholder("Password").fill("friend-pass-123");
  await fp.getByRole("button", { name: "Create account" }).click();
  await fp.getByRole("button", { name: "Not now" }).click().catch(() => {});
  await fp.getByText("Pick your link.").waitFor();
  console.log("a beta user's invite gets someone in ok");
  await fctx.close();

  // and the admin sees where they came from
  const actx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ad = await actx.newPage();
  ad.setDefaultTimeout(15000);
  await ad.goto(BASE + "/");
  await ad.locator(".obloginlink", { hasText: "Already have an account" }).click();
  await ad.getByPlaceholder("you@example.com").fill("mattlegrice@gmail.com");
  await ad.getByPlaceholder("Password").fill("admin-pass-123");
  await ad.locator(".sheet").getByRole("button", { name: "Log in", exact: true }).click();
  await ad.getByRole("button", { name: "Not now" }).click().catch(() => {});
  await ad.goto(BASE + "/admin");
  await ad.getByRole("button", { name: "Invites", exact: true }).click();
  const refRow = ad.locator(".refrow", { hasText: "Riley" });
  await refRow.waitFor();
  await ad.screenshot({ path: OUT + "/shot-admin-referrers.png", fullPage: true });
  // the card carries the attribution too
  const card = ad.locator(".admincard", { hasText: "friendofriley@example.com" });
  await card.getByText("by Riley Requestor").waitFor();
  // tapping a referrer narrows the list below to just their people
  await refRow.click();
  await ad.waitForFunction(
    () => document.querySelectorAll(".admincard").length > 0,
    null,
    { timeout: 8000 },
  );
  {
    const emails = await ad.locator(".admincard-nm").allInnerTexts();
    if (!emails.some((e) => e.includes("friendofriley@example.com")))
      fail("tapping a referrer should show the people they brought in");
    if (emails.some((e) => e.includes("coach2@example.com")))
      fail("tapping a referrer should exclude invites they had nothing to do with");
  }
  console.log("admin sees who invited whom ok");
  await actx.close();
}

await browser.close();
console.log("done");
