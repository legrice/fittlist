// The feedback door: a member writes in, the admin answers, both sides see the
// thread in the app.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true ADMIN_EMAILS=matt@example.com \
//     NEXT_PUBLIC_ORIGIN=http://localhost:3000 npm run start > server.log 2>&1 &
//   node scripts/feedback-smoke.mjs
import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const OUT = process.env.SMOKE_OUT ?? ".";
const fail = (m) => { throw new Error("FEEDBACK FAIL: " + m); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

// the admin, who feedback goes to
const a1 = await b.newContext({ viewport: { width: 390, height: 844 } });
const ad = await a1.newPage();
ad.setDefaultTimeout(15000);
await ad.goto(BASE + "/");
await ad.getByRole("button", { name: "Sign up with email" }).click();
await ad.getByPlaceholder("you@example.com").fill("matt@example.com");
await ad.getByPlaceholder("Password").fill("admin-pass-123");
await ad.getByRole("button", { name: "Create account" }).click();
await ad.getByRole("button", { name: "Not now" }).click().catch(() => {});
await ad.getByText("Pick your link.").waitFor();
await ad.getByPlaceholder("Your name").fill("Matt");
await ad.getByRole("button", { name: "Claim it" }).click();
await ad.getByRole("button", { name: "Skip for now" }).click();
await ad.getByRole("heading", { name: "Your week is empty" }).waitFor();
console.log("admin fixture ok");

// the admin has nobody to send feedback to, so no row
await ad.locator(".usericon").click();
await ad.waitForTimeout(500);
if (await ad.getByText("Send feedback").isVisible().catch(() => false))
  fail("the admin is offered a feedback row pointing at themselves");
console.log("no feedback row for the admin ok");

// a member writes in
const c2 = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await c2.newPage();
p.setDefaultTimeout(15000);
await p.goto(BASE + "/");
await p.getByRole("button", { name: "Sign up with email" }).click();
await p.locator(".roleseg button", { hasText: "here to train" }).click();
await p.getByPlaceholder("you@example.com").fill("mem@example.com");
await p.getByPlaceholder("Password").fill("member-pass-123");
await p.getByRole("button", { name: "Create account" }).click();
await p.getByRole("button", { name: "Not now" }).click().catch(() => {});
await p.getByText("Pick your link.").waitFor();
await p.getByPlaceholder("Your name").fill("Sarah");
await p.getByRole("button", { name: "Claim it" }).click();
// a member's setup is two steps: photo, then who they are
await p.getByRole("heading", { name: "Add a photo." }).waitFor();
await p.getByRole("button", { name: "Continue" }).click();
await p.getByRole("heading", { name: "Tell people who you are." }).waitFor();
await p.getByRole("button", { name: "Finish setup" }).click();
await p.waitForURL("**/feed");

await p.goto(BASE + "/you");
const row = p.getByText("Send feedback").first();
await row.waitFor();
await row.click();
await p.waitForURL(/\/feedback/);
await p.getByText(/goes straight to them/i).waitFor();
await p.screenshot({ path: OUT + "/fb-1-empty.png" });
await p.locator(".chatreply textarea").fill(
  "Edited a class description and my whole schedule disappeared.",
);
await p.getByRole("button", { name: "Send feedback" }).click();
await p.locator(".chatbubble").first().waitFor();
const mine = await p.locator(".chatmsg.mine .chatbubble").allInnerTexts();
if (!mine.join(" ").includes("whole schedule disappeared")) fail("the member's message is missing");
console.log("member sent feedback ok");
await p.screenshot({ path: OUT + "/fb-2-sent.png" });

// the admin sees it, tagged, and replies
await ad.goto(BASE + "/updates?tab=messages");
const thread = p2Row(ad);
await thread.waitFor();
if (!(await ad.locator(".inboxrow-tag").first().isVisible())) fail("no feedback tag in the inbox");
await ad.screenshot({ path: OUT + "/fb-3-inbox.png" });
await thread.click();
await ad.waitForURL(/\/inbox\//);
await ad.locator(".chatreply textarea").fill("Thanks, found it. Fixing today.");
await ad.getByRole("button", { name: "Send" }).click();
await ad.locator(".chatmsg.mine .chatbubble").first().waitFor();
console.log("admin replied ok");

// the member sees the reply, in the app, and the bell says so
await p.goto(BASE + "/you");
if (!(await p.locator(".inboxdot").first().isVisible().catch(() => false)))
  fail("no unread badge after the reply");
await p.goto(BASE + "/feedback");
const theirs = await p.locator(".chatmsg.theirs .chatbubble").allInnerTexts();
if (!theirs.join(" ").includes("Fixing today")) fail("the reply never reached the member");
console.log("member sees the reply ok");
await p.screenshot({ path: OUT + "/fb-4-reply.png" });

// a second message continues the same thread rather than starting another
await p.locator(".chatreply textarea").fill("One more thing: the week header wraps.");
await p.getByRole("button", { name: "Send" }).click();
await p.waitForTimeout(700);
await p.reload();
const all = await p.locator(".chatbubble").allInnerTexts();
if (all.length !== 3) fail(`expected 3 messages in one thread, got ${all.length}`);
await ad.goto(BASE + "/updates?tab=messages");
const rows = await ad.locator(".inboxrow").count();
if (rows !== 1) fail(`expected one thread, got ${rows}`);
console.log("one thread per person ok");

await b.close();
console.log("FEEDBACK CHECKS PASSED");

function p2Row(page) {
  return page.locator(".inboxrow", { hasText: "Sarah" }).first();
}
