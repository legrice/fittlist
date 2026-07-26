// Run the server with INVITE_ONLY=false for this suite: it exercises the full
// self-serve signup flow, which the invite-only beta gate would otherwise
// block. The gate itself is covered by scripts/invite-smoke.mjs.
import { chromium } from "playwright";
import fs from "fs";

const SCRATCH = process.env.SMOKE_OUT ?? ".";
const BASE = "http://localhost:3000";

const fail = (msg) => { throw new Error("SMOKE FAIL: " + msg); };
const expect = async (cond, msg) => { if (!(await cond)) fail(msg); };
const readLog = () => fs.readFileSync(process.env.SERVER_LOG ?? (SCRATCH + "/server.log"), "utf8");
const cardCount = (pg) => pg.locator(".ps-card").count();
const eventCount = (pg) => pg.locator(".ps-event").count();
// The schedule is an infinite calendar: a class recurs across many weeks, so
// count DISTINCT classes by their data-cid rather than rendered rows.
const scheduleClasses = (pg) =>
  pg.evaluate(() =>
    new Set([...document.querySelectorAll(".ps-event[data-cid]")].map((e) => e.getAttribute("data-cid"))).size,
  );
const waitSchedule = (pg, n) =>
  pg.waitForFunction(
    (k) =>
      new Set([...document.querySelectorAll(".ps-event[data-cid]")].map((e) => e.getAttribute("data-cid")))
        .size === k,
    n,
  );
// The account page is a full-screen view reached from the header avatar.
const openProfile = async (pg) => {
  await pg.goto(BASE + "/app");
  await pg.locator(".usericon").click();
  await pg.locator(".acctwrap").waitFor();
};

// Studio-first: pick the studio, then reuse a class from that studio's shared
// catalog via the class-name field.
const addSaved = async (pg) => {
  await pg.getByRole("button", { name: "Add class" }).click();
  await pg.getByRole("heading", { name: "New class" }).waitFor();
  await pg.getByRole("button", { name: "Select or start typing a studio" }).click();
  await pg.getByRole("heading", { name: "Choose a studio" }).waitFor();
  await pg.locator(".studio-row", { hasText: "Ironbound Strength" }).first().click();
  await pg.locator(".studio-sel .nm", { hasText: "Ironbound Strength" }).waitFor();
  await pg.locator("#fName").click();
  await pg.locator(".namesug button", { hasText: "Barbell Strength" }).first().click();
  await pg.waitForFunction(() => {
    const t = document.querySelector("#fName");
    return t && t.value === "Barbell Strength";
  });
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.setDefaultTimeout(10000);

// ---- auth: sign up with email (bottom sheet) -> biometric prompt -> pick URL
await page.goto(BASE + "/");
await expect(page.getByText("built for coaches").isVisible(), "landing headline visible");
await page.getByRole("button", { name: "Sign up with email" }).click();
await page.getByRole("heading", { name: "Sign up with email" }).waitFor();
await page.getByPlaceholder("you@example.com").fill("matt@example.com");
await page.getByPlaceholder("Password").fill("smoke-pass-123");
await page.getByRole("button", { name: "Create account" }).click();
// biometric enrollment prompt appears after a password sign-in
await page.getByRole("heading", { name: "Sign in faster next time?" }).waitFor();
await page.getByRole("button", { name: "Not now" }).click();
await page.getByText("Pick your link.").waitFor();
console.log("password sign-up ok");
await page.getByPlaceholder("Your name").fill("Matt");
await expect(page.getByText("fittlist.co/matt").isVisible(), "URL preview shows fittlist.co/matt");
await page.getByRole("button", { name: "Claim it" }).click();

// ---- setup wizard (photo -> info -> studios), skippable. Skip it and confirm
// we land on the blank schedule with the add button (no auto-opened adder).
await page.getByRole("heading", { name: "Add a photo." }).waitFor();
await page.getByRole("button", { name: "Skip for now" }).click();
await page.getByRole("heading", { name: "Your week is empty" }).waitFor();
if (!(await page.locator('.appshell[data-theme="poster"]').count())) fail("app should be Poster");
console.log("setup wizard skippable, blank schedule ok");

// open the adder from the empty state
await page.getByRole("button", { name: "Add your first class" }).click();
await page.getByRole("heading", { name: "New class" }).waitFor();
console.log("adder opens from empty state");

await page.getByPlaceholder("e.g. Barbell Strength").fill("Barbell Strength");
await page.locator("#fType").selectOption("Strength");
await page.locator("#fDesc").fill("Barbell club for all levels. Bring a belt.");
await page.getByRole("button", { name: "Mo", exact: true }).click();
await page.getByRole("button", { name: "We", exact: true }).click();

// studio-first: pick the studio (create it in the shared directory)
await page.getByRole("button", { name: "Select or start typing a studio" }).click();
await page.getByRole("heading", { name: "Choose a studio" }).waitFor();
await page.getByRole("button", { name: "+ New studio" }).click();
await page.getByPlaceholder("e.g. Palisade Barbell").fill("Ironbound Strength");
await page.getByPlaceholder("e.g. 501 Palisade Ave, Jersey City").fill("143 Newark Ave, Jersey City");
await page.getByRole("button", { name: "Add studio" }).click();
await page.getByText("Added to the studio directory").waitFor();

await page.getByRole("button", { name: "+ Add link" }).click();
await page.getByPlaceholder("Paste a link").fill("https://example.com/book");
await expect(page.locator(".linktag", { hasText: "Website" }).isVisible(), "booking link auto-tagged");

// start/end behave like a calendar event: nudging start slides end (length holds)
const mins = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const endBefore = await page.locator("#fEnd").inputValue();
await page.locator("#fStart").fill("07:00");
const endAfter = await page.locator("#fEnd").inputValue();
if (mins(endAfter) - mins(endBefore) !== 60)
  fail(`start change should slide end +60m: ${endBefore} -> ${endAfter}`);
await page.locator("#fStart").fill("06:00"); // restore for the 6:00a label assertion
console.log("start slides end ok");

// publish CTA is just "Publish event" (no day/time details)
const label = (await page.locator(".publishwrap .btn").textContent()).trim();
console.log("publish label:", label);
if (label !== "Publish event") fail("publish CTA wrong: " + label);
await page.locator(".publishwrap .btn").click();
await page.getByText("Your page is live").waitFor();
await waitSchedule(page, 2);
await page.screenshot({ path: SCRATCH + "/shot-poster-schedule.png" });
console.log("first publish ok");

// ---- steady-state: fab -> pick saved class from the name field -> day -> publish
await addSaved(page);
await page.getByRole("button", { name: "Fr", exact: true }).click();
await page.locator(".publishwrap .btn").click();
await page.getByText("Published", { exact: false }).waitFor();
await waitSchedule(page, 3);
console.log("saved-class flow ok");

// ---- edit in place: tap the Monday class, prefilled with its day, no new class
await page.locator(".ps-daygroup", { hasText: "Mon," }).first().locator(".ps-event").first().click();
await page.getByRole("heading", { name: "Edit class" }).waitFor();
const editLabel = (await page.locator(".publishwrap .btn").textContent()).trim();
if (editLabel !== "Save changes") fail("edit save button should say Save changes: " + editLabel);
// the tapped class's recurring day is prefilled (Monday pill selected)
if (!(await page.locator(".daypick button.sel", { hasText: "Mo" }).count()))
  fail("edit not prefilled with its recurring day");
// class type round-trips: the Type dropdown shows Strength on edit
if ((await page.locator("#fType").inputValue()) !== "Strength")
  fail("class type did not persist (Strength) on edit");
// change the class length by moving the End time (start is 6:00a → 75 min)
await page.locator("#fEnd").fill("07:15");
await expect(page.locator(".durnote", { hasText: "75 min" }).isVisible(), "durnote reflects end time");
await page.locator(".publishwrap .btn").click();
await page.getByText("Saved", { exact: true }).waitFor();
await waitSchedule(page, 3);
console.log("edit ok (end-time length)");

// ---- delete lives inside the edit sheet, behind a confirmation (delete Friday)
await page.locator(".ps-daygroup", { hasText: "Fri," }).first().locator(".ps-event").first().click();
await page.getByRole("heading", { name: "Edit class" }).waitFor();
await page.getByRole("button", { name: "Delete this class" }).click();
await page.getByRole("button", { name: "Keep it" }).click(); // cancel path
await page.getByRole("button", { name: "Delete this class" }).click();
await page.getByRole("button", { name: "Yes, delete it" }).click();
await page.getByText("Deleted", { exact: true }).waitFor();
await waitSchedule(page, 2);
console.log("delete-in-sheet ok (confirm + cancel)");

// ---- account page: full-screen view reached from the header avatar
await expect(
  page.locator(".usericon .usericon-initial").filter({ hasText: "M" }).isVisible(),
  "header shows avatar (initial fallback)",
);
await page.locator(".usericon").click();
await page.locator(".acctwrap").waitFor();
await expect(page.getByRole("heading", { name: "Profile" }).isVisible(), "account page opens");
await expect(page.locator(".accttile .acctname", { hasText: "Matt" }).isVisible(), "account tile shows name");
if ((await page.locator(".acctstats .acctstat").count()) !== 3) fail("expected three stats on the tile");
await expect(page.locator(".acctcard", { hasText: "Preview profile" }).isVisible(), "preview profile card");
await expect(page.locator(".acctcard", { hasText: "Share your week" }).isVisible(), "share your week card");
await page.screenshot({ path: SCRATCH + "/shot-account.png", fullPage: true });

// ---- tap the avatar -> public profile page with owner back + edit
await page.locator(".acctid").click();
await page.waitForURL("**/matt");
await expect(page.locator(".ownerbar .owneredit").isVisible(), "owner edit button on profile");
await page.locator(".ownerbar .owneredit").click();
await page.getByRole("heading", { name: "Edit profile" }).waitFor();
await page.locator("#pTitle").fill("Strength coach");
await page.locator(".abouttext").fill("Strength coach across Jersey City.");
await page.locator("#pInstagram").fill("@mattlifts");
await page.locator("#pWebsite").fill("mattlifts.com");
await page.locator("#pEmail").fill("matt@ironbound.co");
await page.locator("#pPhone").fill("+1 555 867 5309");
await page.getByRole("button", { name: "Save profile" }).click();
await page.getByText("Profile saved").waitFor();
await page.waitForFunction(() => !document.querySelector(".sheet"));
await page.screenshot({ path: SCRATCH + "/shot-poster-mypage.png", fullPage: true });
// the back arrow returns to the account page (not the schedule)
await page.locator(".ownerback").click();
await page.locator(".acctwrap").waitFor();
await page.locator(".acctclose").click();
await page.waitForFunction(() => !document.querySelector(".acctwrap"));
console.log("account + profile edit ok (back -> account)");

// ---- public PROFILE page (mobile): About tab (photo/name/about) + tab switcher
await page.goto(BASE + "/matt");
await expect(page.locator("h1.profname", { hasText: "Matt" }).isVisible(), "profile shows name");
await expect(page.locator(".proftitle", { hasText: "Strength coach" }).isVisible(), "profile shows title");
await expect(page.getByText("Strength coach across Jersey City.").isVisible(), "profile shows about");
await expect(
  page.locator('.proflink[href="https://instagram.com/mattlifts"]').isVisible(),
  "profile shows instagram link",
);
await expect(
  page.locator('.proflink[href="https://mattlifts.com/"]').isVisible(),
  "profile shows website link",
);
await expect(
  page.locator('.proflink[href="mailto:matt@ironbound.co"]').isVisible(),
  "profile shows email contact button",
);
await expect(
  page.locator('.proflink[href^="tel:"]').isVisible(),
  "profile shows call contact button",
);
await expect(
  page.locator(".profstudio", { hasText: "Ironbound Strength" }).isVisible(),
  "profile shows 'Where I coach' studio",
);
await expect(page.locator(".profshare").isVisible(), "profile share button");
await expect(page.locator(".pubtab", { hasText: "About" }).isVisible(), "About tab present");
await expect(page.locator(".pubtab.sel", { hasText: "About" }).isVisible(), "About tab active by default");
await expect(page.locator(".ownerbar .owneredit").isVisible(), "owner edit button on profile");
await expect(page.getByText("Made with").isVisible(), "made-with footer");
await page.screenshot({ path: SCRATCH + "/shot-profile.png", fullPage: true });

// ---- Schedule tab -> continuous public calendar, no navigation, URL updates
await page.locator(".pubtab", { hasText: "Schedule" }).click();
await page.waitForFunction(() => document.querySelector('.pub[data-theme="poster"] .ps-event'));
await page.waitForURL("**/matt/schedule");
await expect(page.getByText("Barbell Strength").first().isVisible(), "schedule shows class");
await page.screenshot({ path: SCRATCH + "/shot-poster-public.png", fullPage: true });

// ---- each event taps through to its own booking page
await page.locator(".ps-event").first().click();
await page.getByRole("heading", { name: "Barbell Strength" }).waitFor();
await expect(page.getByText("143 Newark Ave, Jersey City").isVisible(), "event page shows address");
await expect(page.locator(".evbtn", { hasText: "Book via Website" }).first().isVisible(), "event page shows booking link");
await expect(page.locator(".evtype", { hasText: "Strength" }).isVisible(), "event page shows class type");
await expect(page.getByText("Barbell club for all levels").isVisible(), "event page shows description");
await page.screenshot({ path: SCRATCH + "/shot-event-page.png" });
await page.locator(".evback").click();
await page.waitForFunction(() => document.querySelector('.pub[data-theme="poster"] .ps-event'));
console.log("profile + schedule tabs + event pages ok");

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
await page.waitForFunction(() => document.querySelectorAll(".ps-event").length >= 1);
await page.screenshot({ path: SCRATCH + "/shot-desktop-schedule.png" });
await page.goto(BASE + "/matt/schedule");
await page.waitForFunction(() => document.querySelector('.pub[data-theme="poster"] .ps-event'));
await page.screenshot({ path: SCRATCH + "/shot-desktop-public.png" });
await page.setViewportSize({ width: 390, height: 844 }); // back to the mobile flow
console.log("desktop ok");

// ---- my-page list count reflects subscriber
await openProfile(page);
await page.getByText("On your list", { exact: true }).waitFor();
const subN = await page.locator(".acctstats .acctstat").nth(1).locator(".n").textContent();
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
await addSaved(page);
await page.getByRole("button", { name: "Sa", exact: true }).click();
await page.locator(".publishwrap .btn").click();
await page.getByText("Published · emailed 1 person").waitFor();
await new Promise((r) => setTimeout(r, 400));
mailLog = readLog();
if (!mailLog.includes("[mail:schedule_change] to=fan@example.com")) fail("no schedule_change email");
if (!/Barbell Strength added Sat 6:00a at Ironbound Strength → fittlist\.co\/matt/.test(mailLog))
  fail("change email body wrong");
console.log("publish notification ok");

// delete (via edit sheet) -> removal email (delete the Saturday class)
await waitSchedule(page, 3);
await page.locator(".ps-daygroup", { hasText: "Sat," }).first().locator(".ps-event").first().click();
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
await addSaved(page);
await page.getByRole("button", { name: "Su", exact: true }).click();
await page.locator(".publishwrap .btn").click();
await page.getByText("Published", { exact: false }).waitFor();
await new Promise((r) => setTimeout(r, 600));
const changeCountAfter = (readLog().match(/\[mail:schedule_change\]/g) || []).length;
if (changeCountAfter !== changeCountBefore) fail("opted-out subscriber still got emailed");

await openProfile(page);
await page.getByText("On your list", { exact: true }).waitFor();
const subN2 = await page.locator(".acctstats .acctstat").nth(1).locator(".n").textContent();
if (subN2.trim() !== "0") fail("list should be 0 after unsubscribe, got " + subN2);
console.log("opt-out honored ok");

// ================= Phase 3: dashboard + growth =================
await openProfile(page);
const vis0 = await page.locator(".acctstats .acctstat").nth(0).locator(".n").textContent();
if (vis0.trim() !== "0") fail("own visits should not count, got " + vis0);
console.log("own-visit exclusion ok");

const anon = await browser.newContext({ viewport: { width: 390, height: 844 } });
const anonPage = await anon.newPage();
anonPage.setDefaultTimeout(10000);
await anonPage.goto(BASE + "/matt");
await anonPage.locator(".pubtab", { hasText: "Schedule" }).waitFor();
if ((await anonPage.locator(".ownerbar").count()) !== 0) fail("visitors must not see the owner bar");
await anonPage.goto(BASE + "/matt");
await anonPage.locator(".pubtab", { hasText: "Schedule" }).waitFor();

const ogRes = await anon.request.get(BASE + "/matt", { headers: { "user-agent": "Mozilla/5.0 (smoke test)" } });
const ogHtml = await ogRes.text();
if (!ogHtml.includes('property="og:title"') || !ogHtml.includes("Matt"))
  fail("og:title missing from profile page");
if (!ogHtml.includes('property="og:url"')) fail("og:url missing");
if (!ogHtml.includes("/?via=matt")) fail("footer link not attributed with ?via=matt");
console.log("og tags + attributed footer ok");

await anon.request.get(BASE + "/matt", { headers: { "user-agent": "facebookexternalhit/1.1" } });
await anon.request.get(BASE + "/matt", { headers: { "user-agent": "Twitterbot/1.0" } });

// Growth loop: sign up through the made-with footer, attributed to matt
await anonPage.locator(".madewith").getByText("Claim your page").click();
await anonPage.getByText("built for coaches").waitFor();
if (!anonPage.url().includes("via=matt")) fail("footer click lost via param: " + anonPage.url());
await anonPage.getByRole("button", { name: "Sign up with email" }).click();
await anonPage.getByRole("heading", { name: "Sign up with email" }).waitFor();
await anonPage.getByPlaceholder("you@example.com").fill("sam@example.com");
await anonPage.getByPlaceholder("Password").fill("smoke-pass-sam");
await anonPage.getByRole("button", { name: "Create account" }).click();
// anon context has no virtual authenticator; the biometric prompt still shows
await anonPage.getByRole("button", { name: "Not now" }).click();
await anonPage.getByText("Pick your link.").waitFor();
await anonPage.getByPlaceholder("Your name").fill("Sam");
await anonPage.getByRole("button", { name: "Claim it" }).click();
await anonPage.getByRole("heading", { name: "New class" }).waitFor();
console.log("footer signup flow ok (attribution checked post-run)");

await openProfile(page);
const vis1 = await page.locator(".acctstats .acctstat").nth(0).locator(".n").textContent();
if (vis1.trim() !== "3") fail("visits should be 3 (2 anon views + 1 fetch), got " + vis1);
await expect(page.locator(".acctstats .acctstat", { hasText: "Visits" }).isVisible(), "visits stat labelled");
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

// ---- iCal subscribe feed
const cal = await ctx.request.get(BASE + "/api/cal/matt");
if (cal.status() !== 200) fail("cal feed returned " + cal.status());
if (!(cal.headers()["content-type"] || "").includes("text/calendar")) fail("cal feed not text/calendar");
const ics = await cal.text();
if (!ics.includes("BEGIN:VCALENDAR") || !ics.includes("END:VCALENDAR")) fail("cal feed not a VCALENDAR");
if (!ics.includes("BEGIN:VEVENT")) fail("cal feed has no events");
if (!ics.includes("RRULE:FREQ=WEEKLY")) fail("cal feed missing weekly recurrence");
if (!ics.includes("SUMMARY:Barbell Strength")) fail("cal feed missing class name");
const cal404 = await ctx.request.get(BASE + "/api/cal/nobodyhere");
if (cal404.status() !== 404) fail("cal feed for unknown handle should 404, got " + cal404.status());
console.log("ical feed ok (VEVENT + weekly RRULE)");

// share sheet UI from the account page
await openProfile(page);
await page.locator(".acctcard", { hasText: "Share your week" }).click();
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
// close the story sheet, then the account page beneath it
await page.locator(".sheet .sheetclose").click();
await page.waitForFunction(() => !document.querySelector(".sheet"));
await page.locator(".acctclose").click();
await page.waitForFunction(() => !document.querySelector(".acctwrap"));
console.log("share sheet ok (save + share + colours + X close)");

// ================= dated classes: one-time option =================
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const nowD = new Date();
const dow0 = (nowD.getUTCDay() + 6) % 7; // 0 = Monday
const monD = new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth(), nowD.getUTCDate() - dow0));
const inWeekD = new Date(monD); inWeekD.setUTCDate(monD.getUTCDate() + 6); // Sun this week (in-week, >= today)
const nextWeekD = new Date(monD); nextWeekD.setUTCDate(monD.getUTCDate() + 9); // next week

await page.goto(BASE + "/app");
await page.waitForFunction(() => document.querySelectorAll(".ps-event[data-cid]").length > 0);
const schedBefore = await scheduleClasses(page);

// a one-off dated inside the current week
await addSaved(page);
await page.getByRole("button", { name: "One-time", exact: true }).click();
await page.locator('input[type="date"]').fill(iso(inWeekD));
const oneLabel = (await page.locator(".publishwrap .btn").textContent()).trim();
if (oneLabel !== "Publish event") fail("one-off publish label wrong: " + oneLabel);
await page.locator(".publishwrap .btn").click();
await page.getByText("Published", { exact: false }).waitFor();
await waitSchedule(page, schedBefore + 1);
console.log("one-off in-week ok");

// a next-week one-off - the continuous calendar spans several weeks, so it shows too
await addSaved(page);
await page.getByRole("button", { name: "One-time", exact: true }).click();
await page.locator('input[type="date"]').fill(iso(nextWeekD));
await page.locator(".publishwrap .btn").click();
await page.getByText("Published", { exact: false }).waitFor();
await waitSchedule(page, schedBefore + 2);
console.log("one-off future ok");

// the public schedule is a continuous multi-week window - it renders events
await page.goto(BASE + "/matt/schedule");
await expect(page.locator(".pubtab.sel", { hasText: "Schedule" }).isVisible(), "schedule tab active on /schedule");
await page.waitForFunction(() => document.querySelectorAll(".ps-event").length > 0);
const pubCount = await eventCount(page);
if (pubCount < 1) fail(`public schedule should render events, got ${pubCount}`);
console.log("public continuous schedule ok (" + pubCount + " events)");

// ---- security: enroll a passkey via a CDP virtual authenticator (Face ID/
// fingerprint stand-in), then change the password, from the account page.
const cdp = await ctx.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: {
    protocol: "ctap2",
    transport: "internal",
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  },
});
await openProfile(page);
await page.locator(".setrow", { hasText: "Login & security" }).click();
await page.getByRole("heading", { name: "Login & security" }).waitFor();
// enroll a passkey (single passkey -> offers Remove afterwards)
await page.locator(".secrow", { hasText: "Face ID" }).getByRole("button", { name: "Add" }).click();
await page.getByText("Passkey added").waitFor();
await expect(
  page.locator(".secrow", { hasText: "Face ID" }).getByRole("button", { name: "Remove" }).isVisible(),
  "passkey row shows Remove after enrolling",
);
console.log("passkey enroll ok");

// change the password — requires the current password (re-auth)
await page.locator(".secrow", { hasText: "Password" }).getByRole("button", { name: "Change" }).click();
await page.getByRole("heading", { name: "Change password" }).waitFor();
await page.getByPlaceholder("Current password").fill("smoke-pass-123");
await page.getByPlaceholder("New password").fill("smoke-pass-456");
await page.getByRole("button", { name: "Save password" }).click();
await page.getByText("Password saved").waitFor();
console.log("password change ok");

// back out of the settings sub-view, then log out from the account home
await page.locator(".settingspane .acctclose").click();
await page.getByRole("button", { name: "Log out" }).click();
await page.waitForURL(BASE + "/");
if ((await ctx.cookies()).some((c) => c.name === "fl_session" && c.value))
  fail("session cookie should be cleared after logout");
// a fresh load of /app now bounces to the signed-out landing
await page.goto(BASE + "/app");
await page.getByText("built for coaches").waitFor();
console.log("logout ok");

// ---- magic link: request one from the login sheet, follow the URL, land in /app
await page.goto(BASE + "/");
await page.getByRole("button", { name: "Already have an account? Log in" }).click();
await page.getByRole("heading", { name: "Log in" }).waitFor();
await page.getByPlaceholder("you@example.com").fill("matt@example.com");
await page.getByRole("button", { name: "Email me a magic link instead" }).click();
await page.getByText("Check your inbox.").waitFor();
await new Promise((r) => setTimeout(r, 400));
const magicUrl = [...readLog().matchAll(/\/auth\/magic\?token=[a-f0-9]{64}/g)].pop()[0];
await page.goto(BASE + magicUrl);
await page.waitForURL(BASE + "/app");
await page.getByText("Your schedule").waitFor();
if (!(await ctx.cookies()).some((c) => c.name === "fl_session" && c.value))
  fail("magic link should establish a session");
console.log("magic-link login ok");

// log back out, then sign in with the enrolled passkey from the login sheet
await openProfile(page);
await page.getByRole("button", { name: "Log out" }).click();
await page.waitForURL(BASE + "/");
await page.getByRole("button", { name: "Already have an account? Log in" }).click();
await page.getByRole("heading", { name: "Log in" }).waitFor();
await page.getByRole("button", { name: "Use a passkey" }).click();
await page.waitForURL(BASE + "/app");
await page.getByText("Your schedule").waitFor();
console.log("passkey login ok");

await browser.close();
console.log("ALL SMOKE CHECKS PASSED");
