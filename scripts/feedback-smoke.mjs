// The feedback door: a member writes in, the admin answers, both sides see the
// thread in the app.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true ADMIN_EMAILS=matt@example.com \
//     FEEDBACK_PROMPT_AFTER_DAYS=0 NEXT_PUBLIC_ORIGIN=http://localhost:3000 \
//     npm run start > server.log 2>&1 &
//   node scripts/feedback-smoke.mjs
import { chromium } from "playwright";
import { fillLocation, skipSetup } from "./lib/wizard.mjs";
const BASE = "http://localhost:3000";
const OUT = process.env.SMOKE_OUT ?? ".";
const fail = (m) => { throw new Error("FEEDBACK FAIL: " + m); };
/** Close the feedback prompt if this page happens to be showing one. */
async function dismissPrompt(page) {
  const modal = page.getByRole("dialog", { name: "Feedback" });
  if (!(await modal.isVisible().catch(() => false))) return;
  await modal.getByRole("button", { name: "Not right now" }).click();
  await modal.waitFor({ state: "hidden" });
}
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
await skipSetup(ad);
await ad.getByRole("heading", { name: "Your week is empty" }).waitFor();
console.log("admin fixture ok");

// the admin has nobody to send feedback to, so no row
await ad.locator(".settingsbtn").click();
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
await fillLocation(p);
await p.getByRole("button", { name: "Finish setup" }).click();
await p.waitForURL("**/feed");

await p.goto(BASE + "/you");
// This account is due the "how's it going?" prompt (the server reads
// FEEDBACK_PROMPT_AFTER_DAYS=0), and it's modal: it covers the settings list
// until it's answered. Close it and use the door under it.
await dismissPrompt(p);
const row = p.getByText("Send feedback").first();
await row.waitFor();
await row.click();
await p.waitForURL(/\/feedback/);
await p.getByText(/Every suggestion gets read/i).waitFor();
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

// The prompt: a fresh account that has "been here a while" (the server reads
// FEEDBACK_PROMPT_AFTER_DAYS=0, so onboarding counts) gets asked once.
const c3 = await b.newContext({ viewport: { width: 390, height: 844 } });
const q = await c3.newPage();
q.setDefaultTimeout(15000);
await q.goto(BASE + "/");
await q.getByRole("button", { name: "Sign up with email" }).click();
await q.locator(".roleseg button", { hasText: "here to train" }).click();
await q.getByPlaceholder("you@example.com").fill("asked@example.com");
await q.getByPlaceholder("Password").fill("member-pass-123");
await q.getByRole("button", { name: "Create account" }).click();
await q.getByRole("button", { name: "Not now" }).click().catch(() => {});
await q.getByText("Pick your link.").waitFor();
await q.getByPlaceholder("Your name").fill("Dana");
await q.getByRole("button", { name: "Claim it" }).click();
await q.getByRole("heading", { name: "Add a photo." }).waitFor();
await q.getByRole("button", { name: "Continue" }).click();
await q.getByRole("heading", { name: "Tell people who you are." }).waitFor();
await fillLocation(q);
await q.getByRole("button", { name: "Finish setup" }).click();
await q.waitForURL("**/feed");

const modal = q.getByRole("dialog", { name: "Feedback" });
await modal.waitFor();
await q.screenshot({ path: OUT + "/shot-fb-5-prompt.png" });
console.log("prompt shown ok");

// Shown counts as asked: it doesn't come back on the next screen.
await modal.getByRole("button", { name: "Not right now" }).click();
await modal.waitFor({ state: "hidden" });
await q.goto(BASE + "/discover");
await q.waitForTimeout(900);
if (await q.getByRole("dialog", { name: "Feedback" }).isVisible().catch(() => false))
  fail("the prompt came back after being dismissed");
await q.reload();
await q.waitForTimeout(900);
if (await q.getByRole("dialog", { name: "Feedback" }).isVisible().catch(() => false))
  fail("the prompt came back on a reload");
console.log("asked once ok");

// And someone who already wrote in is never asked.
await p.goto(BASE + "/feed");
await p.waitForTimeout(900);
if (await p.getByRole("dialog", { name: "Feedback" }).isVisible().catch(() => false))
  fail("someone who already sent feedback got the prompt");
console.log("no prompt for someone who already wrote in ok");

await b.close();
console.log("FEEDBACK CHECKS PASSED");

function p2Row(page) {
  return page.locator(".inboxrow", { hasText: "Sarah" }).first();
}
