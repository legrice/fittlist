// Invite-only beta gate. Run the server with the DEFAULT env (INVITE_ONLY on).
// Verifies: a stranger can't sign up but can request an invite, an admin sees
// the request and can invite (by request or by email), and invited emails can
// then sign up.
import { chromium } from "playwright";
import { fillLocation, skipSetup } from "./lib/wizard.mjs";

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
await skipSetup(admin);
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
    // invited: through the same name-and-link claim a coach gets, then a
    // member's own two-step setup, then their week
    await pg.getByRole("button", { name: "Not now" }).click().catch(() => {});
    await pg.getByText("Pick your link.").waitFor();
    await pg.getByPlaceholder("Your name").fill("Member Person");
    await pg.getByRole("button", { name: "Claim it" }).click();
    await pg.getByRole("heading", { name: "Add a photo." }).waitFor();
    await skipSetup(pg);
    await pg.waitForURL("**/feed");
    await pg.getByText("Nobody yet").waitFor();
    console.log("invited member signup ok");

    // 5) Becoming a coach is an ask now, answered in admin: the self-serve
    // switch was how ghost inventory got into the directory.
    await pg.goto(BASE + "/you");
    await pg.locator(".memberid").waitFor();
    await pg.locator(".setrow", { hasText: "Become a coach" }).click();
    await pg.getByRole("heading", { name: "Become a coach" }).waitFor();
    await pg.locator("#crNote").fill("Kettlebells at Ironbound");
    await pg.getByRole("button", { name: "Ask to become a coach" }).click();
    await pg.locator(".setrow .s", { hasText: "Asked. We'll be in touch" }).waitFor();
    console.log("member asked to coach ok");

    // the admin answers it (fresh context; the earlier one is closed)
    const adCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const ad2 = await adCtx.newPage();
    ad2.setDefaultTimeout(15000);
    await ad2.goto(BASE + "/");
    await ad2.locator(".obloginlink", { hasText: "Already have an account" }).click();
    await ad2.getByPlaceholder("you@example.com").fill("mattlegrice@gmail.com");
    await ad2.getByPlaceholder("Password").fill("admin-pass-123");
    await ad2.locator(".sheet").getByRole("button", { name: "Log in", exact: true }).click();
    await ad2.getByRole("button", { name: "Not now" }).click().catch(() => {});
    await ad2.goto(BASE + "/admin");
    await ad2.getByRole("heading", { name: "Wants to coach" }).waitFor();
    const askCard = ad2.locator(".admincard", { hasText: "Kettlebells at Ironbound" });
    await askCard.waitFor();
    await askCard.getByRole("button", { name: "Make them a coach" }).click();
    await ad2.getByText("is a coach now").waitFor();
    await adCtx.close();
    console.log("admin approved the ask ok");

    // approved: the schedule side opens up
    await pg.goto(BASE + "/app");
    await pg.getByRole("heading", { name: "Your week is empty" }).waitFor();
    // the Schedule tab the modal promised is really there
    {
      const tabs = (await pg.locator(".navtab").allInnerTexts()).map((t) => t.trim());
      // The You tab reads as their initial over the label, so match loosely.
      if (!tabs.some((t) => t.includes("You"))) fail(`no You tab after converting: ${tabs.join(",")}`);
    }
    // and the page they already had is still theirs, now with a schedule on it
    const claimed = await pg.request.get(`${BASE}/memberperson`);
    if (!claimed.ok()) fail("the page they already had should still be live");
    if (!(await claimed.text()).includes("pubtab"))
      fail("their page should have a schedule on it now");
    console.log("member -> coach ok (no re-ask, keeps their link, gains the tab)");
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
  if (!(await pg.locator(".obrequest", { hasText: "Request an invite" }).count()))
    fail("an organic landing should offer the invite queue");
  // sign up, then log in, then the queue for people who can't do either yet
  {
    const order = await pg.evaluate(() => {
      const y = (sel) => document.querySelector(sel)?.getBoundingClientRect().top ?? -1;
      return { signup: y(".ob .btn"), login: y(".obloginlink"), request: y(".obrequest") };
    });
    if (!(order.signup < order.login && order.login < order.request))
      fail(`landing actions out of order: ${JSON.stringify(order)}`);
  }
  if (await pg.locator(".invitetag").count()) fail("no invite, no you're-in tag");

  await pg.goto(BASE + "/?invited=1");
  await pg.locator(".invitetag", { hasText: "You’re in" }).waitFor();
  await pg.getByText("Welcome to the").waitFor();
  if (await pg.locator(".obrequest").count())
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
  await skipSetup(pg);
  await pg.getByRole("heading", { name: "Your week is empty" }).waitFor();

  // The banner is how anyone finds out they can invite at all: the settings row
  // has always been there and nobody goes looking in settings for a thing they
  // don't know exists.
  {
    const bar = pg.locator(".invbanner");
    await bar.waitFor();
    const txt = await bar.innerText();
    // Nobody is capped any more, so the banner points at the door rather than
    // rationing it. A count would only come back if BETA_INVITES_PER_USER did.
    if (!/Bring people in/.test(txt)) fail(`the banner doesn't offer to invite: ${txt}`);
    // One tap to the sheet, not a trip through settings.
    await pg.locator(".invbanner-main").click();
    await pg.getByRole("heading", { name: "Your invite link" }).waitFor();
    await pg.locator(".sheetclose").click();
    await pg.waitForTimeout(400);
    await pg.screenshot({ path: OUT + "/shot-invite-banner.png" });
    console.log("invites banner ok (offers the door, one tap to the sheet)");
  }

  // The invite is a link now, not an address we have to be told in advance.
  await pg.goto(BASE + "/app?acct=1");
  await pg.locator(".acctwrap").waitFor();
  await pg.waitForTimeout(450); // the account slides up; clicking mid-flight misses
  const row = pg.locator(".setrow", { hasText: "Invite people to the beta" });
  // centre it rather than letting scrollIntoViewIfNeeded park it under the tabs
  await row.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await row.click();
  await pg.getByRole("heading", { name: "Your invite link" }).waitFor();
  // The link is fetched after the sheet is up, so the heading is not the
  // signal that it is there. Reading straight after it gave an empty string
  // often enough to look like a real failure twice.
  await pg.waitForFunction(
    () => /\/j\/[a-z0-9]{8}$/.test(document.querySelector(".joinlink-url")?.textContent?.trim() ?? ""),
  );
  const joinUrl = (await pg.locator(".joinlink-url").innerText()).trim();
  if (!/\/j\/[a-z0-9]{8}$/.test(joinUrl)) fail(`that doesn't look like a share link: ${joinUrl}`);
  await pg.screenshot({ path: OUT + "/shot-invite-friend.png", fullPage: true });
  console.log(`beta user has a share link ok (${joinUrl})`);

  // The whole point: someone nobody has ever heard of opens that link and gets
  // an account. The gate still holds for anyone who doesn't have one.
  {
    const strangerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const st = await strangerCtx.newPage();
    st.setDefaultTimeout(15000);
    await st.goto(joinUrl.replace("http://localhost:3000", BASE));
    await st.waitForURL(BASE + "/");
    // It says who sent them, by name.
    await st.locator(".invby", { hasText: "Riley Requestor" }).waitFor();
    // And it stops asking them to queue for what they're holding.
    if (await st.locator(".obrequest").count())
      fail("someone on a share link is still being offered the invite queue");
    await st.getByRole("button", { name: "Claim your invite" }).click();
    await st.getByPlaceholder("you@example.com").fill("linkjoiner@example.com");
    await st.getByPlaceholder("Password").fill("stranger-pass-123");
    await st.getByRole("button", { name: "Create account" }).click();
    await st.getByRole("button", { name: "Not now" }).click().catch(() => {});
    await st.getByText("Pick your link.").waitFor();
    await st.getByPlaceholder("Your name").fill("Sam Stranger");
    await st.getByRole("button", { name: "Claim it" }).click();
    await skipSetup(st);
    console.log("a stranger signed up from a share link ok");

    // And Riley can see it happened. The URL still says settings is open, so
    // the reload lands straight back in it: that's the refresh behavior, not
    // a step to repeat.
    await pg.reload();
    await pg.locator(".acctwrap").waitFor();
    await pg.waitForTimeout(450);
    const row2 = pg.locator(".setrow", { hasText: "Invite people to the beta" });
    await row2.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await row2.locator(".s", { hasText: "1 person joined from your link" }).waitFor();
    await row2.click();
    await pg.locator(".invjoined", { hasText: "Sam Stranger" }).waitFor();
    await pg.locator(".sheetclose").click();
    console.log("the inviter sees who joined from their link ok");

    // No link, no account: the gate is still a gate.
    const coldCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const cold = await coldCtx.newPage();
    cold.setDefaultTimeout(15000);
    await cold.goto(BASE + "/");
    await cold.getByRole("button", { name: "Sign up with email" }).click();
    await cold.getByPlaceholder("you@example.com").fill("nobody@example.com");
    await cold.getByPlaceholder("Password").fill("nobody-pass-123");
    await cold.getByRole("button", { name: "Create account" }).click();
    await cold.locator(".sheet .errorcopy", { hasText: /invite-only/i }).waitFor();
    console.log("without a link the gate still holds ok");

    // A link that means nothing is not an error page, it's just the front door
    // with no invite on it.
    const junkCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const junk = await junkCtx.newPage();
    junk.setDefaultTimeout(15000);
    await junk.goto(BASE + "/j/notarealcode");
    await junk.waitForURL(BASE + "/");
    if (await junk.locator(".invby").count()) fail("a junk code named an inviter");
    console.log("a junk share link lands on the front door ok");
  }

  // Closing it is permanent, and permanent means the account rather than this
  // browser: a banner you swat once per device is a banner nobody thanks you for.
  {
    await pg.keyboard.press("Escape").catch(() => {});
    await pg.goto(BASE + "/app");
    await pg.locator(".invbanner-x").click();
    await pg.waitForTimeout(900);
    await pg.reload();
    await pg.waitForTimeout(700);
    if (await pg.locator(".invbanner").count()) fail("the banner came back after being dismissed");
    const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const op = await other.newPage();
    op.setDefaultTimeout(15000);
    await op.goto(BASE + "/");
    await op.getByRole("button", { name: /Log in/i }).first().click();
    await op.getByPlaceholder("you@example.com").fill("riley@example.com");
    await op.getByPlaceholder("Password").fill("invited-pass-123");
    await op.locator(".sheet").getByRole("button", { name: "Log in", exact: true }).click();
    await op.waitForURL(/\/feed/);
    await op.waitForTimeout(900);
    if (await op.locator(".invbanner").count())
      fail("the dismissal stayed in the browser instead of on the account");
    await other.close();
    console.log("banner dismissal sticks, and follows the account ok");
  }
  await ctx.close();

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
  const card = ad.locator(".admincard", { hasText: "linkjoiner@example.com" });
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
    if (!emails.some((e) => e.includes("linkjoiner@example.com")))
      fail("tapping a referrer should show the people they brought in");
    if (emails.some((e) => e.includes("coach2@example.com")))
      fail("tapping a referrer should exclude invites they had nothing to do with");
  }
  console.log("admin sees who invited whom ok");
  await actx.close();
}

await browser.close();
console.log("done");
