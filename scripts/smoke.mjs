import { chromium } from "playwright";
import fs from "fs";

const SCRATCH = process.env.SMOKE_OUT ?? ".";
const BASE = "http://localhost:3000";

const fail = (msg) => { throw new Error("SMOKE FAIL: " + msg); };
const expect = async (cond, msg) => { if (!(await cond)) fail(msg); };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.setDefaultTimeout(10000);

// ---- auth: email -> code -> claim
await page.goto(BASE + "/");
await expect(page.getByText("Never answer").isVisible(), "auth screen 1 visible");
await page.getByPlaceholder("you@example.com").fill("matt@example.com");
await page.getByRole("button", { name: "Email me a code" }).click();
await page.getByText("Check your inbox.").waitFor();

// dev mailer logs the OTP to the server console
await new Promise((r) => setTimeout(r, 500));
const log = fs.readFileSync(process.env.SERVER_LOG ?? (SCRATCH + "/server.log"), "utf8");
const codes = [...log.matchAll(/login code is (\d{6})/g)];
if (!codes.length) fail("no OTP found in server log");
const code = codes[codes.length - 1][1];
console.log("OTP:", code);

await page.getByPlaceholder("••••••").fill(code);
await page.getByRole("button", { name: "Verify" }).click();
await page.getByText("Claim your page.").waitFor();
await page.getByPlaceholder("Matt").fill("Matt");
await expect(page.getByText("fittlist.co/matt").isVisible(), "handle preview shows fittlist.co/matt");
await page.getByRole("button", { name: "Claim it" }).click();

// ---- lands in /app with the adder open on the form stage (no templates yet)
await page.getByRole("heading", { name: "New class" }).waitFor();
console.log("adder auto-opened after claim");

await page.getByPlaceholder("Type it once — it's remembered").fill("Barbell Strength");
await page.getByRole("button", { name: "Mo", exact: true }).click();
await page.getByRole("button", { name: "We", exact: true }).click();

// no studio in the directory yet -> narration asks for one
await expect(page.getByRole("button", { name: "Pick a studio" }).isDisabled().then(d => !d), "publish enabled to route to studio");
// (button is enabled=false only when 0 days; with days but no studio it shows "Pick a studio")
await page.getByRole("button", { name: "Choose a studio" }).click();
await page.getByRole("heading", { name: "Choose a studio" }).waitFor();
await page.getByRole("button", { name: "+ New studio" }).click();
await page.getByPlaceholder("e.g. Palisade Barbell").fill("Ironbound Strength");
await page.getByPlaceholder("e.g. 501 Palisade Ave, Jersey City").fill("143 Newark Ave, Jersey City");
await page.getByRole("button", { name: "Add studio" }).click();
await page.getByText("Added to the studio directory").waitFor();

// booking link
await page.getByRole("button", { name: "+ Add booking link" }).click();
await page.getByPlaceholder("Paste the link").fill("https://example.com/book");

// narrated publish
const pubBtn = page.locator(".publishwrap .btn");
const label = await pubBtn.textContent();
console.log("publish label:", label);
if (!label.includes("Publish 2 classes") || !label.includes("MON, WED") || !label.includes("6:00a"))
  fail("publish narration wrong: " + label);
await pubBtn.click();
await page.getByText("Your page is live").waitFor();
await page.waitForFunction(() => document.querySelectorAll(".class-card").length === 2);
await page.screenshot({ path: SCRATCH + "/shot-mobile-schedule.png" });
console.log("first publish ok");

// ---- steady-state four taps: fab -> saved class -> day -> publish
await page.getByRole("button", { name: "+ Add class" }).click();
await page.getByRole("heading", { name: "Add to your week" }).waitFor();
await page.locator(".sheet .studio-row", { hasText: "Barbell Strength" }).click();
await page.getByText("Everything is filled — just pick the days.").waitFor();
await page.getByRole("button", { name: "Fr", exact: true }).click();
await page.locator(".publishwrap .btn").click();
await page.getByText("Published", { exact: false }).waitFor();
await page.waitForFunction(() => document.querySelectorAll(".class-card").length === 3);
console.log("saved-class flow ok");

// ---- delete one
await page.locator(".class-card .iconbtn[title=Delete]").last().click();
await page.getByText("Removed").waitFor();
await page.waitForFunction(() => document.querySelectorAll(".class-card").length === 2);
console.log("delete ok");

// ---- duplicate opens prefilled with empty days
await page.locator(".class-card .iconbtn[title=Duplicate]").first().click();
await page.getByRole("heading", { name: "Duplicate class" }).waitFor();
const dupName = await page.getByPlaceholder("Type it once — it's remembered").inputValue();
if (dupName !== "Barbell Strength") fail("duplicate not prefilled");
const dupLabel = await page.locator(".publishwrap .btn").textContent();
if (!dupLabel.includes("Pick at least one day")) fail("duplicate days not empty: " + dupLabel);
await page.locator(".sheet-scrim").click({ position: { x: 5, y: 5 } });
console.log("duplicate ok");

// ---- My page tab
await page.locator(".tabbar").getByText("My page").click();
await page.getByText("Your link").waitFor();
await expect(page.locator("h1.screen-title", { hasText: "fittlist.co/matt" }).isVisible(), "my page shows url");
await page.screenshot({ path: SCRATCH + "/shot-mobile-mypage.png" });

// ---- public page (mobile) + subscribe
await page.goto(BASE + "/matt");
await page.getByText("Coaching schedule · this week").waitFor();
await expect(page.getByText("Barbell Strength").first().isVisible(), "public shows class");
await expect(page.getByText("143 Newark Ave, Jersey City").first().isVisible(), "public shows address");
await expect(page.getByText("Book via Website ↗").first().isVisible(), "public shows booking link");
await expect(page.getByText("Made with").isVisible(), "made-with footer");
await page.screenshot({ path: SCRATCH + "/shot-mobile-public.png", fullPage: true });

await page.locator(".notifybar .btn").click();
await page.getByRole("heading", { name: "Get an email when the schedule changes" }).waitFor();
await page.locator("#ntEmail").fill("fan@example.com");
await page.getByRole("button", { name: "Add me to the list" }).click();
await page.getByText("You're on Matt's list").waitFor();
await expect(page.locator(".notifybar .btn").textContent().then(t => t.includes("You're on the list")), "cta flips to subscribed");
console.log("subscribe ok");

// ---- 404 for unclaimed handle
const r = await page.goto(BASE + "/nobodyhere");
if (r.status() !== 404) fail("unclaimed handle should 404, got " + r.status());
await page.getByText("Nobody’s here yet.").waitFor();

// ---- desktop
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(BASE + "/app");
await page.locator(".sidenav").getByText("Schedule").waitFor();
await expect(page.locator(".weekgrid .daycol").count().then(c => c === 7), "desktop shows all 7 day columns");
await page.screenshot({ path: SCRATCH + "/shot-desktop-schedule.png" });
await page.goto(BASE + "/matt");
await page.locator(".heronotify").waitFor();
await page.screenshot({ path: SCRATCH + "/shot-desktop-public.png" });
console.log("desktop ok");

// ---- my-page list count reflects subscriber
await page.goto(BASE + "/app/page");
await page.getByText("on your list", { exact: true }).waitFor();
const subN = await page.locator(".statgrid .stat").nth(1).locator(".n").textContent();
if (subN.trim() !== "1") fail("subscriber count should be 1, got " + subN);
console.log("stats ok");

// ================= Phase 2: the list =================
const readLog = () => fs.readFileSync(process.env.SERVER_LOG ?? (SCRATCH + "/server.log"), "utf8");

// welcome email was sent on subscribe
let mailLog = readLog();
if (!mailLog.includes("[mail:welcome] to=fan@example.com")) fail("no welcome email in log");
if (!mailLog.includes("You're on Matt's list")) fail("welcome subject wrong");
const unsubUrl = (mailLog.match(/Unsubscribe any time: (\S+)/) || [])[1];
if (!unsubUrl) fail("no unsubscribe link in welcome email");
console.log("welcome email ok:", unsubUrl.slice(0, 40) + "…");

// publish -> one schedule_change email to the subscriber
await page.goto(BASE + "/app");
await page.getByRole("button", { name: "+ Add class" }).click();
await page.getByRole("heading", { name: "Add to your week" }).waitFor();
await page.locator(".sheet .studio-row", { hasText: "Barbell Strength" }).click();
await page.getByRole("button", { name: "Sa", exact: true }).click();
await page.locator(".publishwrap .btn").click();
await page.getByText("Published · emailed 1 person").waitFor();
await new Promise((r) => setTimeout(r, 400));
mailLog = readLog();
if (!mailLog.includes("[mail:schedule_change] to=fan@example.com")) fail("no schedule_change email");
if (!/Barbell Strength added Sat 6:00a at Ironbound Strength → fittlist\.co\/matt/.test(mailLog))
  fail("change email body wrong");
console.log("publish notification ok");

// delete -> removal email
await page.waitForFunction(() => document.querySelectorAll(".class-card").length === 3);
await page.locator(".class-card .iconbtn[title=Delete]").last().click();
await page.getByText("Removed · emailed 1 person").waitFor();
await new Promise((r) => setTimeout(r, 400));
mailLog = readLog();
if (!/Barbell Strength removed Sat 6:00a at Ironbound Strength/.test(mailLog))
  fail("removal email body wrong");
console.log("delete notification ok");

// one-click unsubscribe link works and is honored
await page.goto(unsubUrl);
await page.getByText("You’re off the list.").waitFor();
console.log("unsubscribe page ok");

const changeCountBefore = (readLog().match(/\[mail:schedule_change\]/g) || []).length;
await page.goto(BASE + "/app");
await page.getByRole("button", { name: "+ Add class" }).click();
await page.getByRole("heading", { name: "Add to your week" }).waitFor();
await page.locator(".sheet .studio-row", { hasText: "Barbell Strength" }).click();
await page.getByRole("button", { name: "Su", exact: true }).click();
await page.locator(".publishwrap .btn").click();
await page.getByText("Published", { exact: false }).waitFor();
await new Promise((r) => setTimeout(r, 600));
const changeCountAfter = (readLog().match(/\[mail:schedule_change\]/g) || []).length;
if (changeCountAfter !== changeCountBefore) fail("opted-out subscriber still got emailed");

await page.goto(BASE + "/app/page");
await page.getByText("on your list", { exact: true }).waitFor();
const subN2 = await page.locator(".statgrid .stat").nth(1).locator(".n").textContent();
if (subN2.trim() !== "0") fail("list should be 0 after unsubscribe, got " + subN2);
console.log("opt-out honored ok");

// ================= Phase 3: dashboard + growth =================
// The trainer has viewed /matt repeatedly this run while logged in —
// none of that may count.
await page.goto(BASE + "/app/page");
const vis0 = await page.locator(".statgrid .stat").nth(0).locator(".n").textContent();
if (vis0.trim() !== "0") fail("own visits should not count, got " + vis0);
console.log("own-visit exclusion ok");

// Anonymous visitors count (2 page views + 1 raw fetch = 3)
const anon = await browser.newContext({ viewport: { width: 390, height: 844 } });
const anonPage = await anon.newPage();
anonPage.setDefaultTimeout(10000);
await anonPage.goto(BASE + "/matt");
await anonPage.getByText("Coaching schedule · this week").waitFor();
await anonPage.goto(BASE + "/matt");
await anonPage.getByText("Coaching schedule · this week").waitFor();

const ogRes = await anon.request.get(BASE + "/matt", {
  headers: { "user-agent": "Mozilla/5.0 (smoke test)" },
});
const ogHtml = await ogRes.text();
if (!ogHtml.includes('property="og:title"') || !ogHtml.includes("this week's classes"))
  fail("og:title missing from public page");
if (!ogHtml.includes('property="og:url"')) fail("og:url missing");
if (!ogHtml.includes("/?via=matt")) fail("footer link not attributed with ?via=matt");
console.log("og tags + attributed footer ok");

// Crawler user-agents must not count
await anon.request.get(BASE + "/matt", { headers: { "user-agent": "facebookexternalhit/1.1" } });
await anon.request.get(BASE + "/matt", { headers: { "user-agent": "Twitterbot/1.0" } });

// Growth loop: sign up through the made-with footer, attributed to matt
await anonPage.locator(".madewith").getByText("Claim your page").click();
await anonPage.getByText("Never answer").waitFor();
if (!anonPage.url().includes("via=matt")) fail("footer click lost via param: " + anonPage.url());
await anonPage.getByPlaceholder("you@example.com").fill("sam@example.com");
await anonPage.getByRole("button", { name: "Email me a code" }).click();
await anonPage.getByText("Check your inbox.").waitFor();
await new Promise((r) => setTimeout(r, 500));
const code2 = [...readLog().matchAll(/login code is (\d{6})/g)].pop()[1];
await anonPage.getByPlaceholder("••••••").fill(code2);
await anonPage.getByRole("button", { name: "Verify" }).click();
await anonPage.getByText("Claim your page.").waitFor();
await anonPage.getByPlaceholder("Matt").fill("Sam");
await anonPage.getByRole("button", { name: "Claim it" }).click();
await anonPage.getByRole("heading", { name: "New class" }).waitFor();
console.log("footer signup flow ok (attribution checked post-run)");

// Trainer sees 3 visits this week
await page.goto(BASE + "/app/page");
const vis1 = await page.locator(".statgrid .stat").nth(0).locator(".n").textContent();
if (vis1.trim() !== "3") fail("visits should be 3 (2 anon views + 1 fetch), got " + vis1);
await expect(page.getByText("this week").isVisible(), "visits stat shows 'this week'");
console.log("visit stats ok");

await browser.close();
console.log("ALL SMOKE CHECKS PASSED");
