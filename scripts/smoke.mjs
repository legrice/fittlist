import { chromium } from "playwright";
import fs from "fs";

const SCRATCH = process.env.SMOKE_OUT ?? ".";
const BASE = "http://localhost:3000";

const fail = (msg) => { throw new Error("SMOKE FAIL: " + msg); };
const expect = async (cond, msg) => { if (!(await cond)) fail(msg); };
const readLog = () => fs.readFileSync(process.env.SERVER_LOG ?? (SCRATCH + "/server.log"), "utf8");
const cardCount = (pg) => pg.locator(".ps-card").count();

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

await new Promise((r) => setTimeout(r, 500));
const code = [...readLog().matchAll(/login code is (\d{6})/g)].pop()[1];
console.log("OTP:", code);

await page.getByPlaceholder("••••••").fill(code);
await page.getByRole("button", { name: "Verify" }).click();
await page.getByText("Claim your page.").waitFor();
await page.getByPlaceholder("Matt").fill("Matt");
await expect(page.getByText("fittlist.co/matt").isVisible(), "handle preview shows fittlist.co/matt");
await page.getByRole("button", { name: "Claim it" }).click();

// ---- lands in /app on the Poster style with the adder open (form stage)
await page.getByRole("heading", { name: "New class" }).waitFor();
if (!(await page.locator('.appshell[data-theme="poster"]').count())) fail("app should be Poster");
console.log("adder auto-opened, poster default");

await page.getByPlaceholder("Add a class").fill("Barbell Strength");
await page.getByRole("button", { name: "Mo", exact: true }).click();
await page.getByRole("button", { name: "We", exact: true }).click();

// no studio yet -> route through the shared directory + create one
await page.getByRole("button", { name: "Choose a studio" }).click();
await page.getByRole("heading", { name: "Choose a studio" }).waitFor();
await page.getByRole("button", { name: "+ New studio" }).click();
await page.getByPlaceholder("e.g. Palisade Barbell").fill("Ironbound Strength");
await page.getByPlaceholder("e.g. 501 Palisade Ave, Jersey City").fill("143 Newark Ave, Jersey City");
await page.getByRole("button", { name: "Add studio" }).click();
await page.getByText("Added to the studio directory").waitFor();

await page.getByRole("button", { name: "+ Add booking link" }).click();
await page.getByPlaceholder("Paste the link").fill("https://example.com/book");

// narrated publish (start time defaults to 6:00a)
const label = await page.locator(".publishwrap .btn").textContent();
console.log("publish label:", label);
if (!label.includes("Publish 2 classes") || !label.includes("MON, WED") || !label.includes("6:00a"))
  fail("publish narration wrong: " + label);
await page.locator(".publishwrap .btn").click();
await page.getByText("Your page is live").waitFor();
await page.waitForFunction(() => document.querySelectorAll(".ps-card").length === 2);
await page.screenshot({ path: SCRATCH + "/shot-poster-schedule.png" });
console.log("first publish ok");

// ---- steady-state: fab -> saved class -> day -> publish
await page.getByRole("button", { name: "Add class" }).click();
await page.getByRole("heading", { name: "Add to your week" }).waitFor();
await page.locator(".sheet .studio-row", { hasText: "Barbell Strength" }).click();
await page.waitForFunction(() => {
  const t = document.querySelector(".adder-title");
  return t && t.value === "Barbell Strength";
});
await page.getByRole("button", { name: "Fr", exact: true }).click();
await page.locator(".publishwrap .btn").click();
await page.getByText("Published", { exact: false }).waitFor();
await page.waitForFunction(() => document.querySelectorAll(".ps-card").length === 3);
console.log("saved-class flow ok");

// ---- edit in place: tap a card, prefilled with its day, saves without adding one
await page.locator(".ps-card").first().click();
await page.getByRole("heading", { name: "Edit class" }).waitFor();
const editLabel = await page.locator(".publishwrap .btn").textContent();
if (!editLabel.includes("Save changes") || !editLabel.includes("MON"))
  fail("edit not prefilled with its day: " + editLabel);
await page.getByRole("button", { name: "75 min" }).click();
await page.locator(".publishwrap .btn").click();
await page.getByText("Saved", { exact: true }).waitFor();
await page.waitForFunction(() => document.querySelectorAll(".ps-card").length === 3);
console.log("edit ok");

// ---- delete lives inside the edit sheet, behind a confirmation
await page.locator(".ps-card").last().click();
await page.getByRole("heading", { name: "Edit class" }).waitFor();
await page.getByRole("button", { name: "Delete this class" }).click();
await page.getByRole("button", { name: "Keep it" }).click(); // cancel path
await page.getByRole("button", { name: "Delete this class" }).click();
await page.getByRole("button", { name: "Yes, delete it" }).click();
await page.getByText("Deleted", { exact: true }).waitFor();
await page.waitForFunction(() => document.querySelectorAll(".ps-card").length === 2);
console.log("delete-in-sheet ok (confirm + cancel)");

// ---- My page tab (nav has no icons; current tab is plain text, other is a pill)
await page.locator(".tabbar").getByText("My page").click();
await page.getByText("Your link", { exact: true }).waitFor();
await expect(page.locator("h1.screen-title", { hasText: "fittlist.co/matt" }).isVisible(), "my page shows url");
await page.screenshot({ path: SCRATCH + "/shot-poster-mypage.png" });

// ---- public page (mobile) + subscribe
await page.goto(BASE + "/matt");
await page.getByText("Coaching schedule · this week").waitFor();
await page.waitForFunction(() => document.querySelector('.pub[data-theme="poster"] .ps-card'));
await expect(page.getByText("Barbell Strength").first().isVisible(), "public shows class");
await expect(page.getByText("143 Newark Ave, Jersey City").first().isVisible(), "public shows address");
await expect(page.getByText("Book via Website ↗").first().isVisible(), "public shows booking link");
await expect(page.getByText("Made with").isVisible(), "made-with footer");
await page.screenshot({ path: SCRATCH + "/shot-poster-public.png", fullPage: true });

await page.locator(".notifybar .btn").click();
await page.getByRole("heading", { name: "Get an email when the schedule changes" }).waitFor();
await page.locator("#ntEmail").fill("fan@example.com");
await page.getByRole("button", { name: "Add me to the list" }).click();
await page.getByText("You're on Matt's list").waitFor();
await expect(page.locator(".notifybar .btn").textContent().then(t => t.includes("You're on the list")), "cta flips to subscribed");

await page.locator(".notifybar .btn").click();
await page.getByRole("button", { name: "Unsubscribe" }).waitFor();
await page.locator(".sheet .sheetclose").click();
await page.waitForFunction(() => !document.querySelector(".sheet"));
console.log("subscribe ok (manage sheet has Unsubscribe)");

// ---- 404 for unclaimed handle
const r = await page.goto(BASE + "/nobodyhere");
if (r.status() !== 404) fail("unclaimed handle should 404, got " + r.status());
await page.getByText("Nobody’s here yet.").waitFor();

// ---- desktop
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(BASE + "/app");
await page.locator(".sidenav").getByText("Schedule").waitFor();
await page.waitForFunction(() => document.querySelectorAll(".ps-card").length >= 1);
await page.screenshot({ path: SCRATCH + "/shot-desktop-schedule.png" });
await page.goto(BASE + "/matt");
await page.waitForFunction(() => document.querySelector('.pub[data-theme="poster"] .ps-card'));
await page.screenshot({ path: SCRATCH + "/shot-desktop-public.png" });
console.log("desktop ok");

// ---- my-page list count reflects subscriber
await page.goto(BASE + "/app/page");
await page.getByText("on your list", { exact: true }).waitFor();
const subN = await page.locator(".statgrid .stat").nth(1).locator(".n").textContent();
if (subN.trim() !== "1") fail("subscriber count should be 1, got " + subN);
console.log("stats ok");

// ================= Phase 2: the list =================
let mailLog = readLog();
if (!mailLog.includes("[mail:welcome] to=fan@example.com")) fail("no welcome email in log");
if (!mailLog.includes("You're on Matt's list")) fail("welcome subject wrong");
const unsubUrl = (mailLog.match(/Unsubscribe any time: (\S+)/) || [])[1];
if (!unsubUrl) fail("no unsubscribe link in welcome email");
console.log("welcome email ok:", unsubUrl.slice(0, 40) + "…");

// publish -> one schedule_change email to the subscriber
await page.goto(BASE + "/app");
await page.getByRole("button", { name: "Add class" }).click();
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

// delete (via edit sheet) -> removal email
await page.waitForFunction(() => document.querySelectorAll(".ps-card").length === 3);
await page.locator(".ps-card").last().click();
await page.getByRole("heading", { name: "Edit class" }).waitFor();
await page.getByRole("button", { name: "Delete this class" }).click();
await page.getByRole("button", { name: "Yes, delete it" }).click();
await page.getByText("Deleted · emailed 1 person").waitFor();
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
await page.getByRole("button", { name: "Add class" }).click();
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
await page.goto(BASE + "/app/page");
const vis0 = await page.locator(".statgrid .stat").nth(0).locator(".n").textContent();
if (vis0.trim() !== "0") fail("own visits should not count, got " + vis0);
console.log("own-visit exclusion ok");

const anon = await browser.newContext({ viewport: { width: 390, height: 844 } });
const anonPage = await anon.newPage();
anonPage.setDefaultTimeout(10000);
await anonPage.goto(BASE + "/matt");
await anonPage.getByText("Coaching schedule · this week").waitFor();
await anonPage.goto(BASE + "/matt");
await anonPage.getByText("Coaching schedule · this week").waitFor();

const ogRes = await anon.request.get(BASE + "/matt", { headers: { "user-agent": "Mozilla/5.0 (smoke test)" } });
const ogHtml = await ogRes.text();
if (!ogHtml.includes('property="og:title"') || !ogHtml.includes("this week's classes"))
  fail("og:title missing from public page");
if (!ogHtml.includes('property="og:url"')) fail("og:url missing");
if (!ogHtml.includes("/?via=matt")) fail("footer link not attributed with ?via=matt");
console.log("og tags + attributed footer ok");

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

await page.goto(BASE + "/app/page");
const vis1 = await page.locator(".statgrid .stat").nth(0).locator(".n").textContent();
if (vis1.trim() !== "3") fail("visits should be 3 (2 anon views + 1 fetch), got " + vis1);
await expect(page.getByText("this week").isVisible(), "visits stat shows 'this week'");
console.log("visit stats ok");

// ================= v1.5: story image =================
const story = await ctx.request.get(BASE + "/api/story/matt?span=week");
if (story.status() !== 200) fail("story endpoint returned " + story.status());
if (!(story.headers()["content-type"] || "").includes("image/png")) fail("story is not a png");
const buf = await story.body();
if (buf.readUInt32BE(16) !== 1080 || buf.readUInt32BE(20) !== 1920) fail("story should be 1080x1920");
const storyDay = await ctx.request.get(BASE + "/api/story/matt?span=day");
if (storyDay.status() !== 200) fail("story day span failed");
const s404 = await ctx.request.get(BASE + "/api/story/nobodyhere?span=week");
if (s404.status() !== 404) fail("story for unknown handle should 404, got " + s404.status());
console.log("story endpoint ok (1080x1920 png)");

// share sheet UI on My page
await page.goto(BASE + "/app/page");
await page.locator(".rowcta", { hasText: "Share your week" }).click();
await page.getByRole("heading", { name: "Your story image" }).waitFor();
await page.waitForFunction(() => {
  const img = document.querySelector(".storyimg");
  return img && img.complete && img.naturalWidth > 0;
});
await page.locator(".seg").getByText("Today").click();
const imgSrc = await page.locator(".storyimg").getAttribute("src");
if (!imgSrc.includes("span=day")) fail("Today toggle didn't switch span: " + imgSrc);
const dl = await page.locator("a", { hasText: "Save image" }).getAttribute("download");
if (!dl || !dl.endsWith(".png")) fail("save link missing download attr");
await expect(page.locator(".btn.ghost", { hasText: "Share image" }).isVisible(), "share image button present");

// story colour picker: 4 chips, selecting swaps the preview + download URLs
if ((await page.locator(".themechip").count()) !== 4) fail("expected 4 story colour chips");
await page.locator(".themechip", { hasText: "Moss" }).click();
const themedSrc = await page.locator(".storyimg").getAttribute("src");
if (!themedSrc.includes("theme=moss")) fail("colour chip didn't switch preview: " + themedSrc);
for (const th of ["paper", "moss", "pop"]) {
  const r2 = await ctx.request.get(BASE + `/api/story/matt?span=week&theme=${th}`);
  if (r2.status() !== 200 || !(r2.headers()["content-type"] || "").includes("image/png"))
    fail(`story colour ${th} endpoint broken`);
}
await page.locator(".themechip", { hasText: "Iron" }).click();
await page.screenshot({ path: SCRATCH + "/shot-share-sheet.png" });
await page.locator(".sheet .sheetclose").click();
await page.waitForFunction(() => !document.querySelector(".sheet"));
console.log("share sheet ok (save + share + colours + X close)");

// ================= dated classes: weekly default + one-time option =================
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const nowD = new Date();
const dow0 = (nowD.getUTCDay() + 6) % 7; // 0 = Monday
const monD = new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth(), nowD.getUTCDate() - dow0));
const inWeek = new Date(monD); inWeek.setUTCDate(monD.getUTCDate() + 5); // Sat this week
const future = new Date(monD); future.setUTCDate(monD.getUTCDate() + 10); // next week

await page.goto(BASE + "/app");
const weekBefore = await cardCount(page);

// a one-off dated inside the current week shows in the main week
await page.getByRole("button", { name: "Add class" }).click();
await page.getByRole("heading", { name: "Add to your week" }).waitFor();
await page.locator(".sheet .studio-row", { hasText: "Barbell Strength" }).click();
await page.getByRole("button", { name: "One-time", exact: true }).click();
await page.locator('input[type="date"]').fill(iso(inWeek));
const oneLabel = await page.locator(".publishwrap .btn").textContent();
if (!/^Publish · \w{3}, \w{3} \d+ · 6:00a$/.test(oneLabel.trim()))
  fail("one-off publish label wrong: " + oneLabel);
await page.locator(".publishwrap .btn").click();
await page.getByText("Published", { exact: false }).waitFor();
await page.waitForFunction((n) => document.querySelectorAll(".ps-card").length === n, weekBefore + 1);
console.log("one-off in-week ok");

// a future-dated one-off lands in "Up Next", not the current week
await page.getByRole("button", { name: "Add class" }).click();
await page.locator(".sheet .studio-row", { hasText: "Barbell Strength" }).click();
await page.getByRole("button", { name: "One-time", exact: true }).click();
await page.locator('input[type="date"]').fill(iso(future));
await page.locator(".publishwrap .btn").click();
await page.getByText("Published", { exact: false }).waitFor();
await page.getByText("Up Next").waitFor();
await page.waitForFunction((n) => document.querySelectorAll(".ps-card").length === n, weekBefore + 2);
console.log("one-off future -> Up Next ok");

// public page shows the in-week one-off but never the future one
await page.goto(BASE + "/matt");
await page.getByText("Coaching schedule · this week").waitFor();
const pubCards = await cardCount(page);
if (pubCards !== weekBefore + 1)
  fail(`public should show weekly + in-week one-off only, got ${pubCards} (want ${weekBefore + 1})`);
console.log("public excludes future one-off ok");

await browser.close();
console.log("ALL SMOKE CHECKS PASSED");
