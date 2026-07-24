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

await browser.close();
console.log("ALL SMOKE CHECKS PASSED");
