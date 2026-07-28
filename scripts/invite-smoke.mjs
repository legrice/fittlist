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
await p1.getByText(/invite-only/i).waitFor();
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

// 4) Members are not part of the beta gate. With FANS_ENABLED=true the signup
// sheet offers "I'm here to train", and that path skips invites entirely —
// which is the whole point of opening the member side while coaches stay
// invite-only. Skipped when the flag is dark, since the toggle isn't rendered.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  pg.setDefaultTimeout(15000);
  await pg.goto(BASE + "/");
  await pg.getByRole("button", { name: "Sign up with email" }).click();
  const roleToggle = pg.locator(".roleseg button", { hasText: "here to train" });
  if (await roleToggle.count()) {
    await roleToggle.click();
    await pg.getByPlaceholder("you@example.com").fill("member@example.com");
    await pg.getByPlaceholder("Password").fill("member-pass-123");
    await pg.getByRole("button", { name: "Create account" }).click();
    // no invite wall, no handle claim — straight to their week
    await pg.waitForURL("**/feed");
    await pg.getByText("Nobody yet").waitFor();
    if (await pg.getByText("Invite-only beta").count())
      fail("a member signup should never hit the invite wall");
    console.log("member signup ok (no invite needed)");

    // 5) And a member can become a coach later, without an invite either: the
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

await browser.close();
console.log("done");
