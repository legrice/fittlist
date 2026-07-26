// Invite-only beta gate. Run the server with the DEFAULT env (INVITE_ONLY on).
// Verifies: a stranger can't sign up, an admin can invite by email, and the
// invited email can then sign up.
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const OUT = process.env.SMOKE_OUT ?? ".";
const fail = (m) => { throw new Error("INVITE SMOKE FAIL: " + m); };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

// 1) A non-invited email is blocked at signup.
const ctx1 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p1 = await ctx1.newPage();
p1.setDefaultTimeout(15000);
await p1.goto(BASE + "/");
await p1.getByRole("button", { name: "Sign up with email" }).click();
await p1.getByRole("heading", { name: "Sign up with email" }).waitFor();
if (!(await p1.getByText("Invite-only beta").isVisible())) fail("signup sheet should note invite-only");
await p1.getByPlaceholder("you@example.com").fill("stranger@example.com");
await p1.getByPlaceholder("Password").fill("stranger-pass-123");
await p1.getByRole("button", { name: "Create account" }).click();
await p1.getByText(/invite-only/i).waitFor();
const stillOnLanding = await p1.getByRole("heading", { name: "Sign up with email" }).isVisible();
if (!stillOnLanding) fail("stranger should be blocked, not signed up");
await p1.screenshot({ path: OUT + "/shot-invite-blocked.png" });
console.log("non-invited signup blocked ok");
await ctx1.close();

// 2) Admin (exempt email) signs up and invites a coach by email.
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
console.log("admin (exempt) signup ok");

await admin.goto(BASE + "/admin");
await admin.getByRole("heading", { name: "Admin" }).waitFor();
await admin.getByRole("button", { name: "Invites", exact: true }).click();
await admin.getByPlaceholder("coach@example.com").fill("coach2@example.com");
await admin.getByPlaceholder("Note (name, gym) — optional").fill("Jordan at Ironbound");
await admin.getByRole("button", { name: "Invite & email link" }).click();
await admin.locator(".adminlink input").waitFor();
console.log("admin invited coach2@example.com ok");
await admin.locator(".admincard", { hasText: "coach2@example.com" }).waitFor();
await admin.waitForTimeout(300);
await admin.screenshot({ path: OUT + "/shot-invite-admin.png", fullPage: true });
await ctx2.close();

// 3) The invited email can now sign up.
const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const coach = await ctx3.newPage();
coach.setDefaultTimeout(15000);
await coach.goto(BASE + "/");
await coach.getByRole("button", { name: "Sign up with email" }).click();
await coach.getByPlaceholder("you@example.com").fill("coach2@example.com");
await coach.getByPlaceholder("Password").fill("coach2-pass-123");
await coach.getByRole("button", { name: "Create account" }).click();
await coach.getByRole("button", { name: "Not now" }).click().catch(() => {});
await coach.getByText("Pick your link.").waitFor();
console.log("invited email signup ok");
await ctx3.close();

await browser.close();
console.log("done");
