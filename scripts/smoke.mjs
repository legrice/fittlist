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
const waitSchedule = (pg, n, timeout = 10000) =>
  pg.waitForFunction(
    (k) =>
      new Set([...document.querySelectorAll(".ps-event[data-cid]")].map((e) => e.getAttribute("data-cid")))
        .size === k,
    n,
    { timeout },
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

// Flip dark mode from the account view. The toggle sets <html data-mode>
// immediately; the .appshell attribute only lands after the server re-renders,
// so reload for that rather than waiting on router.refresh() (which stalls
// under load and made this the flakiest step in the suite).
const setDark = async (pg, want) => {
  await pg.goto(BASE + "/app");
  await pg.locator(".usericon").click();
  await pg.locator(".acctwrap").waitFor();
  await pg.waitForTimeout(450); // the account slides up; clicking mid-flight misses
  const row = pg.locator(".setrow", { hasText: "Dark mode" });
  await row.scrollIntoViewIfNeeded();
  if ((await row.getAttribute("aria-pressed")) === String(want)) return;
  await row.click();
  await pg.waitForFunction(
    (w) => (document.documentElement.getAttribute("data-mode") === "dark") === w,
    want,
  );
  await pg.goto(BASE + "/app"); // server truth
  await pg.waitForFunction(
    (w) => !!document.querySelector('.appshell[data-mode="dark"]') === w,
    want,
    { timeout: 20000 },
  );
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
await page.locator(".ps-daygroup", { hasText: "Monday" }).first().locator(".ps-event").first().click();
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
await waitSchedule(page, 3, 20000);
// Editing a weekly class recreates its rows with new ids via router.refresh();
// let that settle so the delete below targets a current row, not a stale id.
await page.waitForTimeout(700);
console.log("edit ok (end-time length)");

// ---- delete lives inside the edit sheet, behind a confirmation (delete Friday)
await page.locator(".ps-daygroup", { hasText: "Friday" }).first().locator(".ps-event").first().click();
await page.getByRole("heading", { name: "Edit class" }).waitFor();
await page.getByRole("button", { name: "Delete this class" }).click();
await page.getByRole("button", { name: "Keep it" }).click(); // cancel path
// The edit step just before this can recreate rows with fresh ids mid-flight,
// so a delete can occasionally hit a stale row id. Retry the whole flow once.
for (let attempt = 0; ; attempt++) {
  await page.getByRole("button", { name: "Delete this class" }).click();
  await page.getByRole("button", { name: "Yes, delete it" }).click();
  await page.getByText("Deleted", { exact: true }).waitFor();
  let done = false;
  try { await waitSchedule(page, 2, 8000); done = true; } catch {}
  if (!done) {
    await page.reload();
    await page.locator(".dashlink", { hasText: "Share cal" }).waitFor();
    done = (await scheduleClasses(page)) === 2;
  }
  if (done) break;
  if (attempt >= 1) fail("delete did not persist after retry");
  await page.locator(".ps-daygroup", { hasText: "Friday" }).first().locator(".ps-event").first().click();
  await page.getByRole("heading", { name: "Edit class" }).waitFor();
}
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
if ((await page.locator(".acctstats .acctstat").count()) !== 4) fail("expected four analytics stats");
await expect(page.locator(".acctstats .acctstat", { hasText: "Profile views" }).isVisible(), "profile views stat");
await expect(page.locator(".acctstats .acctstat", { hasText: "Followers" }).isVisible(), "followers stat");
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
// the avatar colour picker (shown only while there's no photo): pick one and
// make sure it's the colour the public page renders behind the initial
// the swatches live behind "Or pick a colour" so the form isn't a wall of dots
await page.getByRole("button", { name: "Or pick a colour" }).click();
await page.locator(".swatchgrid .swatch").first().waitFor();
const pickedColor = await page.locator(".swatchgrid .swatch").nth(23).evaluate((e) => {
  e.click();
  return getComputedStyle(e).backgroundColor;
});
await page.getByRole("button", { name: "Save profile" }).click();
await page.getByText("Profile saved").waitFor();
await page.reload();
const shownAvatar = await page
  .locator(".profphoto-empty")
  .evaluate((e) => getComputedStyle(e).backgroundColor);
if (shownAvatar !== pickedColor)
  fail(`avatar colour didn't stick: picked ${pickedColor}, page shows ${shownAvatar}`);
console.log("avatar colour pick ok (persists to the public page)");
await page.waitForFunction(() => !document.querySelector(".sheet"));
await page.screenshot({ path: SCRATCH + "/shot-poster-mypage.png", fullPage: true });
// the back arrow returns to the account page (not the schedule)
await page.locator(".ownerback").click();
await page.locator(".acctwrap").waitFor();
await page.locator(".acctclose").click();
await page.waitForFunction(() => !document.querySelector(".acctwrap"));
console.log("account + profile edit ok (back -> account)");

// ---- the top of the schedule is three tools, no title: the tab bar already
// says which space you're in.
await page.goto(BASE + "/app");
{
  const pills = (await page.locator(".dashlinks .dashlink").allInnerTexts()).map((t) => t.trim());
  const want = ["Your page", "Share cal", "QR code"];
  if (pills.join("|") !== want.join("|"))
    fail("schedule tools should be " + want.join(", ") + ", got " + pills.join(", "));
}
if (await page.locator(".calbar-title", { hasText: "Your schedule" }).count())
  fail("the schedule title should be gone");
// each pill goes where it says
await page.locator(".dashlink", { hasText: "QR code" }).click();
await page.locator(".sheet .qrframe").waitFor();
await page.locator(".sheet .sheetclose").click();
await page.waitForFunction(() => !document.querySelector(".sheet"));
await page.locator(".dashlink", { hasText: "Share cal" }).click();
await page.locator(".sheet .storyimg").waitFor();
await page.locator(".sheet .sheetclose").click();
await page.waitForFunction(() => !document.querySelector(".sheet"));
await page.locator(".dashlink", { hasText: "Your page" }).click();
await page.waitForURL("**/matt");
await page.goto(BASE + "/app");
// and the QR is still reachable from the account view
await openProfile(page);
await page.locator(".acctcard", { hasText: "QR code" }).click();
await page.locator(".sheet .qrframe").waitFor();
await page.locator(".sheet .sheetclose").click();
await page.waitForFunction(() => !document.querySelector(".sheet"));
await page.locator(".acctclose").click();
await page.waitForFunction(() => !document.querySelector(".acctwrap"));
console.log("schedule tools ok (three pills, no title)");

// ---- page look: dark mode persists on the account and themes the app AND
// the public page (visitors see it too — it's a server-rendered attribute).
await setDark(page, true);
await page.goto(BASE + "/matt");
await page.waitForFunction(() => document.querySelector('.pub[data-mode="dark"]'));
// dark is the VIEWER's preference: a logged-out visitor to the same page gets
// light, and a signed-in dark viewer gets dark on someone else's page
// bot UA so this check doesn't register as a profile view and skew the stats
const lightCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: "facebookexternalhit/1.1",
});
const lightPage = await lightCtx.newPage();
await lightPage.goto(BASE + "/matt");
await lightPage.locator(".pub").waitFor();
if (await lightPage.locator('.pub[data-mode="dark"]').count())
  fail("a logged-out visitor should see the page in light");
await lightCtx.close();
console.log("dark page look ok (viewer's preference, light when logged out)");
// back to light for the rest of the run
await setDark(page, false);
console.log("light restored ok");

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

// Subscribing is a visitor action — the owner previewing their own page never
// sees the subscribe bar, so do this from a fresh anonymous context.
{
  // A bot-flagged UA keeps this helper visit out of the profile-view counts
  // asserted below, while the subscribe form (a server action, not a page GET)
  // still records the subscription.
  const subCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (smoke subscribe bot)",
  });
  const subPage = await subCtx.newPage();
  subPage.setDefaultTimeout(10000);
  await subPage.goto(BASE + "/matt");
  await subPage.locator(".notifybar .btn").click();
  await subPage.locator(".sheet h2", { hasText: "schedule every week" }).waitFor();
  await subPage.locator("#ntEmail").fill("fan@example.com");
  await subPage.getByRole("button", { name: "Add me to the list" }).click();
  await subPage.getByText("You're on Matt's list").waitFor();
  await expect(subPage.locator(".notifybar .btn").textContent().then(t => t.includes("You're on the list")), "cta flips to subscribed");

  await subPage.locator(".notifybar .btn").click();
  await subPage.getByRole("button", { name: "Unsubscribe" }).waitFor();
  await subPage.locator(".sheet .sheetclose").click();
  await subPage.waitForFunction(() => !document.querySelector(".sheet"));
  await subCtx.close();
}
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
await page.locator(".acctstats .acctstat", { hasText: "Followers" }).waitFor();
const subN = await page.locator(".acctstats .acctstat").nth(2).locator(".n").textContent();
if (subN.trim() !== "1") fail("follower count should be 1, got " + subN);
console.log("stats ok");

// ---- that follow dropped a notification; the single Updates bell carries the
// combined badge and opens a Notifications | Messages toggle.
await page.goto(BASE + "/app");
await page.locator(".dashlink", { hasText: "Share cal" }).waitFor();
await expect(page.locator('a[href="/updates"] .inboxdot').isVisible(), "updates bell shows a badge");
await page.locator('a[href="/updates"]').click();
await page.getByRole("heading", { name: "Updates" }).waitFor();
await expect(page.locator(".notifrow .nm", { hasText: "New follower" }).isVisible(), "follow notification listed");
await page.locator(".updateseg button", { hasText: "Messages" }).click();
await page.getByText("No messages yet", { exact: false }).waitFor();
await page.locator(".updateseg button", { hasText: "Notifications" }).click();
await page.locator(".notifrow").first().waitFor();
// opening the feed clears the badge
await page.goto(BASE + "/app");
await page.locator(".dashlink", { hasText: "Share cal" }).waitFor();
if (await page.locator('a[href="/updates"] .inboxdot').count())
  fail("updates badge should clear after opening the feed");
console.log("updates (notifications + messages) ok");

// ================= Phase 2: the weekly list =================
const CRON_KEY = process.env.CRON_SECRET ?? "smoke-cron";
let mailLog = readLog();
if (!mailLog.includes("[mail:welcome] to=fan@example.com")) fail("no welcome email in log");
if (!mailLog.includes("You're on Matt's list")) fail("welcome subject wrong");
const unsubUrl = (mailLog.match(/Unsubscribe any time: (\S+)/) || [])[1];
if (!unsubUrl) fail("no unsubscribe link in welcome email");
console.log("welcome email ok:", unsubUrl.slice(0, 40) + "…");

// publishing no longer sends a per-change email — subscribers get a weekly digest
await page.goto(BASE + "/app");
await addSaved(page);
await page.getByRole("button", { name: "Sa", exact: true }).click();
await page.locator(".publishwrap .btn").click();
await page.getByText("Published", { exact: false }).waitFor();
await new Promise((r) => setTimeout(r, 300));
if (readLog().includes("[mail:schedule_change]")) fail("publish should not send a per-change email");
console.log("publish sends no per-change email ok");

// the weekly cron emails the subscriber the upcoming week with the class in it
let cron = await page.request.get(`${BASE}/api/cron/weekly?key=${CRON_KEY}`);
if (!cron.ok()) fail("weekly cron endpoint failed: " + cron.status());
await new Promise((r) => setTimeout(r, 500));
mailLog = readLog();
const weeklyBlock = mailLog.split("[mail:weekly_schedule] to=fan@example.com").slice(1).join("");
if (!weeklyBlock) fail("no weekly digest email to the subscriber");
if (!/Barbell Strength/.test(weeklyBlock)) fail("weekly digest missing the class");
console.log("weekly digest ok");

// unsubscribe link works and is honored. Emails use the canonical origin
// (fittlist.co); rewrite it to this local server so the sandbox can reach it.
const localUnsub = unsubUrl.replace(/^https?:\/\/[^/]+/, BASE);
await page.goto(localUnsub);
await page.getByText("You’re off the list.").waitFor();
console.log("unsubscribe page ok");

// opted-out subscriber is skipped on the next weekly run
const weeklyBefore = (readLog().match(/\[mail:weekly_schedule\] to=fan@example\.com/g) || []).length;
cron = await page.request.get(`${BASE}/api/cron/weekly?key=${CRON_KEY}`);
if (!cron.ok()) fail("weekly cron endpoint failed (2): " + cron.status());
await new Promise((r) => setTimeout(r, 500));
const weeklyAfter = (readLog().match(/\[mail:weekly_schedule\] to=fan@example\.com/g) || []).length;
if (weeklyAfter !== weeklyBefore) fail("opted-out subscriber still got the weekly email");
console.log("opt-out honored ok");

await openProfile(page);
await page.locator(".acctstats .acctstat", { hasText: "Followers" }).waitFor();
const subN2 = await page.locator(".acctstats .acctstat").nth(2).locator(".n").textContent();
if (subN2.trim() !== "0") fail("followers should be 0 after unsubscribe, got " + subN2);
console.log("opt-out honored ok");

// ================= Phase 3: dashboard + growth =================
await openProfile(page);
const vis0 = await page.locator(".acctstats .acctstat").nth(0).locator(".n").textContent();
if (vis0.trim() !== "0") fail("own profile views should not count, got " + vis0);
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
// claiming a handle runs the setup wizard; skip it to land on the schedule
await anonPage.getByRole("heading", { name: "Add a photo." }).waitFor();
await anonPage.getByRole("button", { name: "Skip for now" }).click();
await anonPage.getByRole("heading", { name: "Your week is empty" }).waitFor();
console.log("footer signup flow ok (attribution checked post-run)");

// Give Sam a class so there's a second coach for the coach-follows-coach test.
// An empty schedule offers the CTA, not the fab, so open the adder that way.
await anonPage.getByRole("button", { name: "Add your first class" }).click();
await anonPage.getByRole("heading", { name: "New class" }).waitFor();
await anonPage.getByRole("button", { name: "Select or start typing a studio" }).click();
await anonPage.getByRole("heading", { name: "Choose a studio" }).waitFor();
await anonPage.locator(".studio-row", { hasText: "Ironbound Strength" }).first().click();
await anonPage.locator(".studio-sel .nm", { hasText: "Ironbound Strength" }).waitFor();
await anonPage.locator("#fName").fill("Sam's Conditioning");
await anonPage.getByRole("button", { name: "Mo", exact: true }).click();
await anonPage.locator(".publishwrap .btn").click();
await anonPage.getByText("Your page is live").waitFor();
console.log("second coach has a class ok");

await openProfile(page);
const vis1 = await page.locator(".acctstats .acctstat").nth(0).locator(".n").textContent();
if (vis1.trim() !== "3") fail("profile views should be 3 (2 anon views + 1 fetch), got " + vis1);
await expect(page.locator(".acctstats .acctstat", { hasText: "Profile views" }).isVisible(), "profile views stat labelled");
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
await page.locator(".sheet h2", { hasText: "Share your week" }).waitFor();
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

// story style dropdown: 8 curated looks with swatches, selecting swaps the preview
await page.locator("#stTheme").click();
if ((await page.locator(".stylepick-row").count()) !== 8) fail("expected 8 story styles");
await page.locator(".stylepick-row", { hasText: "Moss" }).click();
const themedSrc = await page.locator(".storyimg").getAttribute("src");
if (!themedSrc.includes("theme=moss")) fail("colour chip didn't switch preview: " + themedSrc);
for (const th of ["paper", "moss", "pop", "midnight", "sunset", "blush", "slate"]) {
  const r2 = await ctx.request.get(BASE + `/api/story/matt?span=week&theme=${th}`);
  if (r2.status() !== 200 || !(r2.headers()["content-type"] || "").includes("image/png"))
    fail(`story colour ${th} endpoint broken`);
}
await page.locator("#stTheme").click();
await page.locator(".stylepick-row", { hasText: "Ink" }).click();
// custom headline: typing + blur persists and re-renders the preview
const preHeadlineSrc = await page.locator(".storyimg").getAttribute("src");
await page.locator(".storycustom input").fill("Lets work");
await page.locator(".storycustom input").blur();
await page.waitForFunction(
  (prev) => document.querySelector(".storyimg")?.getAttribute("src") !== prev,
  preHeadlineSrc,
);
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
// deep-link scrolls to the schedule; the scroll-spy marks the tab active once settled
await page.locator(".pubtab.sel", { hasText: "Schedule" }).waitFor();
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
// The magic route consumes the token (setting the session cookie) and then 302s
// to the canonical origin (fittlist.co), which is unreachable from the sandbox.
// Fire the request without following that cross-origin redirect — the Set-Cookie
// still lands in this context — then navigate to /app as an authenticated user.
const magicRes = await ctx.request.get(BASE + magicUrl, { maxRedirects: 0 });
if (![301, 302, 303, 307, 308].includes(magicRes.status()))
  fail("magic link should redirect after setting the session, got " + magicRes.status());
await page.goto(BASE + "/app");
await page.locator(".dashlink", { hasText: "Share cal" }).waitFor();
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
await page.locator(".dashlink", { hasText: "Share cal" }).waitFor();
console.log("passkey login ok");

// ================= fan side (needs FANS_ENABLED=true on the server) =================
const fanCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const fan = await fanCtx.newPage();
fan.setDefaultTimeout(10000);
await fan.goto(BASE + "/");
await fan.getByRole("button", { name: "Sign up with email" }).click();
await fan.getByRole("heading", { name: "Sign up with email" }).waitFor();
await fan.locator(".roleseg button", { hasText: "here to train" }).click();
await fan.getByPlaceholder("you@example.com").fill("lindley@example.com");
await fan.getByPlaceholder("Password").fill("smoke-pass-fan");
await fan.getByRole("button", { name: "Create account" }).click();
// fans skip the invite gate, the handle claim, AND the passkey offer: the
// cookie-set rerender redirects them straight to the feed
await fan.getByText("Nobody yet").waitFor();

// phase 3: the directory. Empty feed points at it; follow happens inline.
await fan.getByRole("link", { name: "Find coaches" }).click();
await fan.locator(".calbar-title", { hasText: "Discover" }).waitFor();
await fan.locator(".disrow", { hasText: "Matt" }).waitFor();
if (!(await fan.locator(".disrow", { hasText: "class" }).count()))
  fail("directory row missing the classes-this-week line");
// search narrows, and a miss says so
await fan.locator(".dissearch-in").fill("zzzz");
await fan.getByText("No coaches yet").waitFor();
await fan.locator(".dissearch-in").fill("Matt");
await fan.locator(".disrow", { hasText: "Matt" }).waitFor();
await fan.locator(".dissearch-x").click();
// follow inline, then confirm it stuck on the coach's own page
await fan.locator(".disrow", { hasText: "Matt" }).locator(".disfollow").click();
await fan.locator(".disrow", { hasText: "Matt" }).locator(".disfollow.on").waitFor();
await fan.goto(BASE + "/matt");
await fan.locator(".notifybar .btn", { hasText: "Following" }).waitFor();
console.log("discover ok (search + inline follow)");
await fan.goto(BASE + "/feed");
// phase 2: merged agenda — avatar strip on top, chronological class rows below
await fan.locator(".feedav", { hasText: "Matt" }).waitFor();
await fan.locator(".feedagenda .ps-event").first().waitFor();
const feedRows = await fan.locator(".feedagenda .ps-event").count();
if (feedRows < 1) fail("feed agenda has no class rows");
// tap the avatar to filter to that coach, then clear it
await fan.locator(".feedav", { hasText: "Matt" }).click();
await fan.locator(".feedfilterbar", { hasText: "Classes with Matt" }).waitFor();
await fan.locator(".feedagenda .ps-event").first().waitFor();
// the All circle clears the filter
await fan.locator(".feedav", { hasText: "All" }).click();
await fan.locator(".feedfilterbar").waitFor({ state: "detached" });
await fan.locator(".feedav.on", { hasText: "All" }).waitFor();
// tapping a selected coach again also clears it
await fan.locator(".feedav", { hasText: "Matt" }).click();
await fan.locator(".feedfilterbar").waitFor();
await fan.locator(".feedav", { hasText: "Matt" }).click();
await fan.locator(".feedfilterbar").waitFor({ state: "detached" });
// the rail only carries coaches with something in the week — a chip that can
// only ever empty the screen doesn't belong there
{
  const chips = (await fan.locator(".feedav-nm").allInnerTexts())
    .map((t) => t.trim())
    .filter((t) => t !== "All");
  const inWeek = await fan.locator(".feedagenda .ps-ecoach-txt").allInnerTexts();
  for (const nm of chips)
    if (!inWeek.some((c) => c.trim().startsWith(nm)))
      fail(`${nm} is on the rail with no classes in the week`);
}
// each row reads coach, then class, then studio
{
  const order = await fan
    .locator(".feedagenda .ps-event")
    .first()
    .locator(".ps-ebody > *")
    .evaluateAll((els) => els.map((e) => e.className.split(" ")[0]));
  if (order[0] !== "ps-ecoach" || order[1] !== "ps-enm")
    fail("agenda row should read coach, then class name: " + order.join(","));
}
console.log("fan flow ok (signup -> follow -> merged feed + filter)");

// photo-less coaches must be visually distinct — that's the whole point of the
// palette, so no two listed coaches may share a colour
await fan.goto(BASE + "/discover");
await fan.locator(".disrow-av-empty").first().waitFor();
const avColors = await fan.locator(".disrow-av-empty").evaluateAll((els) =>
  els.map((e) => getComputedStyle(e).backgroundColor),
);
if (new Set(avColors).size !== avColors.length)
  fail("photo-less coaches share an avatar colour: " + avColors.join(", "));
if (avColors.some((c) => !c || c === "rgba(0, 0, 0, 0)")) fail("avatar rendered with no colour");
console.log(
  `avatar colours ok (${avColors.length} listed, all distinct)` +
    (avColors.length < 2 ? " — only one coach is listed, so this is a weak check" : ""),
);

// "I'm going" + the member's share image — the mirror of the coach's story
await fan.goto(BASE + "/feed");
await fan.locator(".feedagenda .ps-event").first().waitFor();
// marking happens on the class itself now, not on the crowded week row
if (await fan.locator(".feedagenda .goingbtn").count())
  fail("the week should not carry an inline I'm going button");
await fan.locator(".feedagenda .ps-event").first().click();
// the class fills the page and the going CTA is pinned to the bottom of it
if (await fan.locator(".evcard").count()) fail("the class page should not be a card");
await expect(
  fan.locator(".evcta").evaluate((e) => getComputedStyle(e).position === "fixed"),
  "the going CTA is pinned to the bottom",
);
await fan.getByRole("button", { name: "I'm going" }).click();
await fan.getByRole("button", { name: "You're going" }).waitFor();
// it survives a reload (the note is on the server, not just in the tab)
await fan.reload();
await fan.getByRole("button", { name: "You're going" }).waitFor();
// and the week reports it back
await fan.goto(BASE + "/feed");
await fan.locator(".feedagenda .ps-event.goingon .ps-goingtag").first().waitFor();
await fan.locator(".goingbar").waitFor();
// "Going" filters the week down to what they committed to
await fan.locator(".goingfilter").click();
const goingRows = await fan.locator(".feedagenda .ps-event").count();
if (goingRows !== 1) fail(`Going filter should show 1 row, got ${goingRows}`);
await fan.locator(".goingfilter").click();
// the share image renders from their attendance, not a coach's schedule
const myStory = await fan.request.get(`${BASE}/api/story/me?theme=paper`);
if (!myStory.ok()) fail("member story image failed: " + myStory.status());
const myBuf = Buffer.from(await myStory.body());
if (myBuf.length < 5000) fail("member story image suspiciously small");
if (myBuf.readUInt32BE(16) !== 1080 || myBuf.readUInt32BE(20) !== 1920)
  fail("member story image is not 1080x1920");
await fan.locator(".goingshare").click();
await fan.getByRole("heading", { name: "Share my week" }).waitFor();
await fan.locator(".adderclose").click();
console.log("going + share my week ok (1080x1920 png)");

// the merged weekly digest: one "Your week" email covering every coach they
// follow, instead of one email per coach
const fanDigestCount = () =>
  (readLog().match(/\[mail:weekly_schedule\] to=lindley@example\.com/g) || []).length;
const digestBefore = fanDigestCount();
let dcron = await fan.request.get(`${BASE}/api/cron/weekly?key=${CRON_KEY}`);
if (!dcron.ok()) fail("weekly cron failed (digest): " + dcron.status());
await new Promise((r) => setTimeout(r, 600));
const fanDigests = fanDigestCount() - digestBefore;
// exactly one email, no matter how many coaches they follow — that's the point
if (fanDigests !== 1) fail(`expected exactly 1 merged digest, got ${fanDigests}`);
const digestBlock = readLog().split("[mail:weekly_schedule] to=lindley@example.com").pop() || "";
if (!/Barbell Strength/.test(digestBlock)) fail("merged digest missing the class");
if (!/Your week/.test(digestBlock)) fail("merged digest missing the subject");
console.log("merged digest ok (one email across coaches)");

// stopping the digest must NOT unfollow anyone — the feed stays intact
const digestUnsub = (digestBlock.match(/\/u\/digest\/[A-Za-z0-9._-]+/) || [])[0];
if (!digestUnsub) fail("merged digest has no unsubscribe link");
await fan.goto(BASE + digestUnsub);
await fan.getByText("No more weekly emails.").waitFor();
await fan.goto(BASE + "/feed");
await fan.locator(".feedagenda .ps-event").first().waitFor(); // still following
const afterOptOut = fanDigestCount();
dcron = await fan.request.get(`${BASE}/api/cron/weekly?key=${CRON_KEY}`);
if (!dcron.ok()) fail("weekly cron failed (post opt-out): " + dcron.status());
await new Promise((r) => setTimeout(r, 600));
if (fanDigestCount() !== afterOptOut) fail("digest opt-out ignored");
console.log("digest opt-out ok (email stops, follows survive)");

// the directory opt-out: off means gone from Find coaches, page still public.
// Checked from the fan's browser — a coach never sees themselves listed.
await openProfile(page);
await page.locator(".setrow", { hasText: "Listed in Find coaches" }).click();
await page.locator(".setrow", { hasText: "only people with your link" }).waitFor();
await fan.goto(BASE + "/discover");
await fan.locator(".calbar-title", { hasText: "Discover" }).waitFor();
if (await fan.locator(".disrow", { hasText: "Matt" }).count())
  fail("opted-out coach still listed in the directory");
const pub = await fan.request.get(`${BASE}/matt`);
if (!pub.ok()) fail("opting out of the directory broke the public page");
await openProfile(page);
await page.locator(".setrow", { hasText: "Listed in Find coaches" }).click();
await page.locator(".setrow", { hasText: "Members can find you" }).waitFor();
await fan.goto(BASE + "/discover");
await fan.locator(".disrow", { hasText: "Matt" }).waitFor();
await fanCtx.close();
console.log("directory opt-out ok (delisted, page still public)");

// a coach following another coach: two separate spaces. Their own schedule
// stays what they teach; following lives on /feed and never leaks publicly.
await page.goto(BASE + "/sam");
await page.locator(".notifybar .btn", { hasText: "Follow" }).click();
await page.locator(".notifybar .btn", { hasText: "Following" }).waitFor();
await page.goto(BASE + "/feed");
await page.locator(".feedagenda .ps-event").first().click();
await page.getByRole("button", { name: "I'm going" }).click();
await page.getByRole("button", { name: "You're going" }).waitFor();
// it shows on the following page
await page.goto(BASE + "/feed");
await page.locator(".feedagenda .ps-event.goingon .ps-goingtag").first().waitFor();
// but the coach's own schedule is only what they teach
await page.goto(BASE + "/app");
await page.locator(".ps-event").first().waitFor();
const ownWeek = await page.locator(".ps-week").innerText();
if (/Conditioning/.test(ownWeek))
  fail("a class the coach attends showed up on their own schedule");
// with the bottom nav to cross between the two spaces
await page.locator(".navtab", { hasText: "Home" }).click();
await page.locator(".feedstrip").waitFor();
await page.locator(".navtab.on", { hasText: "Home" }).waitFor();
await page.locator(".navtab", { hasText: "Discover" }).click();
await page.locator(".calbar-title", { hasText: "Discover" }).waitFor();
await page.locator(".navtab", { hasText: "Schedule" }).click();
await page.locator(".dashlink", { hasText: "Share cal" }).waitFor();
// no dead ends: a class opened from Home goes back to Home, and a coach's
// page carries the nav so you can leave it
await page.locator(".navtab", { hasText: "Home" }).click();
await page.locator(".feedagenda .ps-event").first().click();
await page.locator(".evname").waitFor();
// the back control is an arrow in a circle, so the destination lives in its label
await expect(
  page.getByRole("button", { name: "Back to Home" }).isVisible(),
  "class opened from Home goes back to Home",
);
await page.getByRole("button", { name: "Back to Home" }).click();
await page.locator(".feedstrip").waitFor();
// a coach's own schedule still backs into their calendar
await page.goto(BASE + "/sam/schedule");
await page.locator(".ps-event").first().click();
await page.locator(".evname").waitFor();
if (!(await page.getByRole("button", { name: /Back to .*schedule/ }).count()))
  fail("a class opened from a coach's page should back into that page");
// a dark viewer sees someone else's page in dark, whatever that coach chose
await setDark(page, true);
await page.goto(BASE + "/sam");
await page.waitForFunction(() => document.querySelector('.pub[data-mode="dark"]'));
await setDark(page, false);
console.log("viewer look wins on another coach's page ok");

// the coach's page itself has the nav
await page.goto(BASE + "/sam");
if ((await page.locator(".navbar .navtab").count()) !== 3)
  fail("a coach's page needs the nav so you can't get trapped");
await page.locator(".navtab", { hasText: "Schedule" }).click();
await page.locator(".dashlink", { hasText: "Share cal" }).waitFor();
console.log("no dead ends ok (back to Home, nav on coach pages)");

// three tabs only, and the account opens from the header avatar
if ((await page.locator(".navtab").count()) !== 3) fail("expected 3 tabs");
await page.locator(".usericon").click();
await page.locator(".acctwrap").waitFor();
await page.locator(".acctclose").click();
// what a coach attends is private: it must not leak onto their public page
const pubHtml = await (await page.request.get(`${BASE}/matt/schedule`)).text();
if (/Sam&#x27;s Conditioning|Sam's Conditioning/.test(pubHtml))
  fail("a class the coach attends leaked onto their public page");
console.log("coach following ok (separate from their schedule, never public)");

// a coach can walk the member side from settings while the flag is dark
await openProfile(page);
await page.locator(".setrow", { hasText: "Your week" }).click();
await page.locator(".feedstrip, .empty-block").first().waitFor();
await page.locator(".navtab", { hasText: "Schedule" }).click();
await page.locator(".dashlink", { hasText: "Share cal" }).waitFor();
console.log("coach fan-view preview ok");

// deleting a coach has to clear every row that points at them — follows they
// made, "going" marks on their classes, notifications, inquiry threads. Miss
// one and Postgres refuses the whole delete on a foreign key.
await page.goto(BASE + "/admin");
await page.getByText("sam@example.com").waitFor();
const samCard = page.locator(".admincard").filter({ hasText: "sam@example.com" });
await samCard.getByRole("button", { name: "Delete user" }).click();
await samCard.getByRole("button", { name: "Yes, delete" }).click();
await page.getByText("Deleted Sam").waitFor();
await page.waitForFunction(() => !document.body.innerText.includes("sam@example.com"));
console.log("delete coach ok (follows, going marks, threads all cleared)");

await browser.close();
console.log("ALL SMOKE CHECKS PASSED");
