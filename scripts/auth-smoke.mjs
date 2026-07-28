// Password recovery for an account that never had a password — the exact hole
// a beta coach fell into: invited by email, signed in via the link, then locked
// out in a different browser.
//
// Needs a FRESH database and a local origin, since it follows the emailed link:
//   rm -rf .data/pglite
//   FANS_ENABLED=true NEXT_PUBLIC_ORIGIN=http://localhost:3000 npm run start
//   node scripts/auth-smoke.mjs
// Leave INVITE_ONLY at its default — the gate is part of what's being tested.
import { chromium } from "playwright";
import fs from "fs";
const BASE = "http://localhost:3000";
const OUT = process.env.SMOKE_OUT ?? ".";
const fail = (m) => { throw new Error("PW SMOKE FAIL: " + m); };
const log = () => fs.readFileSync("/home/user/fittlist/server.log", "utf8");
const lastMagic = () => [...log().matchAll(/\/auth\/magic\?token=[a-f0-9]{64}/g)].pop()[0];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

// admin bootstraps and invites a coach who will only ever use email links
const a = await browser.newContext({ viewport: { width: 390, height: 844 } });
const ad = await a.newPage();
ad.setDefaultTimeout(15000);
await ad.goto(BASE + "/");
await ad.getByRole("button", { name: "Sign up with email" }).click();
await ad.getByPlaceholder("you@example.com").fill("mattlegrice@gmail.com");
await ad.getByPlaceholder("Password").fill("admin-pass-123");
await ad.getByRole("button", { name: "Create account" }).click();
await ad.getByRole("button", { name: "Not now" }).click().catch(() => {});
await ad.getByPlaceholder("Your name").fill("Matt Admin");
await ad.getByRole("button", { name: "Claim it" }).click();
await ad.getByRole("button", { name: "Skip for now" }).click();
await ad.goto(BASE + "/admin");
await ad.getByRole("button", { name: "Invites", exact: true }).click();
await ad.getByPlaceholder("coach@example.com").fill("nopw@example.com");
await ad.getByRole("button", { name: "Invite & email link" }).click();
await ad.locator(".adminlink input").waitFor();
await a.close();

// the invited coach signs in by link only — no password is ever set
const c1 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p1 = await c1.newPage();
p1.setDefaultTimeout(15000);
await p1.goto(BASE + "/");
await p1.getByRole("button", { name: "Sign up with email" }).click();
await p1.getByPlaceholder("you@example.com").fill("nopw@example.com");
await p1.getByRole("button", { name: "Email me a magic link" }).click();
await p1.getByText("Check your inbox").waitFor();
await p1.goto(BASE + lastMagic());
await p1.getByText("Pick your link.").waitFor();
await p1.getByPlaceholder("Your name").fill("Nopw Coach");
await p1.getByRole("button", { name: "Claim it" }).click();
await p1.getByRole("button", { name: "Skip for now" }).click();
await p1.getByRole("heading", { name: "Your week is empty" }).waitFor();
console.log("passwordless account created ok");
await c1.close();

// a different browser: this is where they got stuck
const c2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p2 = await c2.newPage();
p2.setDefaultTimeout(15000);
await p2.goto(BASE + "/");
await p2.locator(".obloginlink", { hasText: "Already have an account" }).click();
await p2.getByPlaceholder("you@example.com").fill("nopw@example.com");
await p2.getByPlaceholder("Password").fill("guessing-123");
await p2.locator(".sheet").getByRole("button", { name: "Log in", exact: true }).click();
await p2.locator(".sheet .errorcopy", { hasText: /doesn't have a password yet/ }).waitFor();
await p2.screenshot({ path: OUT + "/shot-nopw-error.png" });
console.log("passwordless login explains itself ok");

// the recovery path, in the words they'd look for
await p2.locator(".sheet .authforgot", { hasText: "Forgot your password?" }).click();
await p2.getByText("Check your inbox").waitFor();
if (!(await p2.getByText("set a new password").count()))
  fail("the reset copy should promise a password, not just a sign-in");
await p2.screenshot({ path: OUT + "/shot-reset-sent.png" });
await p2.goto(BASE + lastMagic());
// landing from the link offers to set one, so the next browser is not another trip
await p2.getByRole("heading", { name: "Set a password" }).waitFor();
await p2.screenshot({ path: OUT + "/shot-setpw.png" });
await p2.locator("#spwNew").fill("brand-new-pass-9");
await p2.getByRole("button", { name: "Set password" }).click();
await p2.getByRole("heading", { name: "Set a password" }).waitFor({ state: "detached" });
console.log("set-password prompt ok");

// and now the password actually works in a third browser
const c3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p3 = await c3.newPage();
p3.setDefaultTimeout(15000);
await p3.goto(BASE + "/");
await p3.locator(".obloginlink", { hasText: "Already have an account" }).click();
await p3.getByPlaceholder("you@example.com").fill("nopw@example.com");
await p3.getByPlaceholder("Password").fill("brand-new-pass-9");
await p3.locator(".sheet").getByRole("button", { name: "Log in", exact: true }).click();
await p3.getByRole("button", { name: "Not now" }).click().catch(() => {});
await p3.waitForURL("**/app");
console.log("recovered password works in a fresh browser ok");
await c3.close();

// the role toggle: only rendered when FANS_ENABLED is exactly "true"
const c4 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p4 = await c4.newPage();
p4.setDefaultTimeout(15000);
await p4.goto(BASE + "/");
await p4.getByRole("button", { name: "Sign up with email" }).click();
const n = await p4.locator(".roleseg button").count();
console.log(`role toggle buttons on the signup sheet: ${n}`);
if (n !== 2) fail("expected the coach/member toggle");
await p4.screenshot({ path: OUT + "/shot-roleseg.png" });
await c4.close();

await browser.close();
console.log("PW + ROLE CHECKS PASSED");
