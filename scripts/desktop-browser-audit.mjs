import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { chromium, firefox, webkit } from "playwright";

// Use disposable data and a production build, as the mobile audit does.
const fixturePath = process.env.DESKTOP_FIXTURES || execFileSync(process.execPath, ["--import", "tsx", "scripts/audit-fixtures.ts"], { env: { ...process.env, DATABASE_URL: "" }, encoding: "utf8" }).trim().split("\n").at(-1);
const f = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const browserName = process.env.AUDIT_BROWSER || "chromium";
assert(["chromium", "webkit", "firefox"].includes(browserName), "Supported desktop browser");
const base = "http://localhost:3192";
const output = `${f.directory}/desktop-${browserName}`;
fs.mkdirSync(output, { recursive: true });
const log = fs.openSync(`${output}/server.log`, "w");
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3192"], {
  env: { ...process.env, DATABASE_URL: "", PGLITE_DATA_DIR: f.dataDir, SESSION_SECRET: f.secret, ALLOW_EMBEDDED_DB_IN_PRODUCTION: "true", RESEND_API_KEY: "", BLOB_READ_WRITE_TOKEN: "", ADMIN_EMAILS: "", INVITE_ONLY: "false", FANS_ENABLED: "true", NEXT_PUBLIC_ORIGIN: base }, stdio: ["ignore", log, log],
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { browser: browserName, checks: [] };
let browser;
let page;
try {
  let ready = false;
  for (let i = 0; i < 90; i++) {
    assert.equal(server.exitCode, null, "Desktop audit server is running");
    try { if ((await fetch(base)).ok) { ready = true; break; } } catch {}
    await pause(500);
  }
  assert(ready, "Desktop audit server ready");
  browser = await ({ chromium, firefox, webkit }[browserName]).launch(browserName === "chromium" && process.env.AUDIT_CHROME_CHANNEL ? { channel: process.env.AUDIT_CHROME_CHANNEL } : {});
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await context.addCookies([{ name: "fl_session", value: f.owner.token, url: base, httpOnly: true, sameSite: "Lax" }]);
  await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const rail = page.locator(".desktop-top-header");
  async function visit(path) {
    // WebKit prepares the downloadable image for native sharing. Complete and
    // verify it before the route crawl unloads the document; otherwise WebKit
    // can report an access-control diagnostic for a request interrupted by goto.
    const shareExport = browserName === "webkit" && path === "/coachshare"
      ? page.waitForResponse(response => new URL(response.url()).pathname === "/api/story/compose")
      : null;
    const response = await page.goto(base + path);
    assert(response.status() < 400, `${path} loads`);
    await rail.waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    if (shareExport) {
      const exported = await shareExport;
      assert.equal(exported.status(), 200, "Share image generates successfully");
      assert.match(exported.headers()["content-type"], /^image\/png/, "Share produces a PNG");
      assert.equal(await exported.finished(), null, "Share image finishes before the route crawl continues");
    }
  }
  async function frame() {
    await rail.waitFor();
    assert(await rail.isVisible(), "Desktop header is visible");
    assert(await rail.evaluate(el => !el.closest("[inert]")), "Desktop header is usable");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "No horizontal page overflow");
    const bounds = await rail.boundingBox();
    const content = await page.locator(".screen.hasnav > .pad,.pub.hasnav .profwrap").first().boundingBox();
    assert(content && content.y >= bounds.y + bounds.height - 1, "Page content clears the header");
  }
  async function centeredDialog(name) {
    const dialog = page.getByRole("dialog", { name, exact: true });
    await dialog.waitFor();
    const rect = await dialog.boundingBox(), viewport = page.viewportSize();
    assert(rect.y >= 24 && rect.y + rect.height <= viewport.height - 24, `${name} fits vertically`);
    assert(Math.abs(rect.x + rect.width / 2 - viewport.width / 2) < 2, `${name} is horizontally centered`);
    assert(Math.abs(rect.y + rect.height / 2 - viewport.height / 2) < 2, `${name} is vertically centered`);
    await page.waitForFunction(() => document.activeElement?.closest('[role="dialog"]'));
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
  }
  for (const width of [940, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: width < 1100 ? 768 : 900 });
    for (const route of ["/calendar", "/calendar/following", "/auditcoach", "/s/audit-studio", "/g/audit-group", "/s/audit-studio/manage"]) {
      await visit(route); await frame();
      if (route === "/calendar" || route === "/calendar/following") {
        await page.getByRole("heading", { name: route === "/calendar" ? "Your calendar" : "Following", exact: true }).waitFor();
        assert.equal(await page.locator(".calendar-action-sheet:visible,.calendar-scope-hero:visible").count(), 0, "Calendar opens directly without a reveal surface");
        assert.equal(await rail.locator('[aria-current="page"]').count(), 1, "One primary rail destination is selected");
        if (route === "/calendar") {
          const sidebar = page.getByRole("complementary", { name: "Calendar navigation" });
          await sidebar.waitFor();
          const left = await page.locator(".calendar-workspace > .calendar-cardwrap").boundingBox();
          const right = await sidebar.boundingBox();
          assert(right.x >= left.x + left.width, "Date navigator sits beside the schedule");
          assert.equal(await page.getByRole("combobox", { name: "View calendar" }).count(), 1, "Only one visible calendar filter");
          const date = sidebar.locator(".calendar-mini-grid button:not(:disabled)").first();
          if (await date.count()) { await date.click(); assert(await date.getAttribute("aria-pressed") === "true", "Date selection is reflected"); }
        }
        if (route === "/calendar/following") {
          const sidebar = page.getByRole("complementary", { name: "Following calendar navigation" });
          await sidebar.waitFor();
          const left = await page.locator(".following-schedule-column").boundingBox();
          assert((await sidebar.boundingBox()).x >= left.x + left.width, "Following date navigator sits beside its schedule");
          assert.equal(await page.locator('.following-schedule-column [aria-label="Calendar scope"]').count(), 1, "Following filters sit above the listing");
        }
        await page.getByRole("button", { name: "Month view", exact: true }).click();
        assert.equal(await page.locator(".calendar-date-sidebar:visible").count(), 0, "Month view uses the full width");
        await page.locator(".monthblock").first().waitFor();
        if (route === "/calendar") {
          await page.locator(".monthblock").nth(3).scrollIntoViewIfNeeded();
          const strip = page.locator(".scrollhead.on");
          await strip.waitFor();
          const stripBox=await strip.boundingBox(), navBox=await rail.boundingBox();
          assert(stripBox.y >= navBox.y + navBox.height, `Scrolled month toolbar leaves navigation accessible: ${JSON.stringify({stripBox,navBox,style:await strip.evaluate(e=>({top:getComputedStyle(e).top,transform:getComputedStyle(e).transform}))})}`);
        }
        await page.getByRole("button", { name: "Day view", exact: true }).click();
      }
      if (["/auditcoach", "/s/audit-studio", "/g/audit-group"].includes(route)) {
        const header = page.locator(".profile-seam-top,.group-seam-top");
        const studioProfile = route === "/s/audit-studio";
        const title = route.startsWith("/g/") ? page.locator(".group-copy-name") : page.locator(".studio-desktop-name");
        const box = await header.boundingBox(), text = await title.boundingBox();
        if (studioProfile) {
          const avatar = await page.locator(".profile-identity-lead .profav").boundingBox();
          const about = await page.locator("#profile-about").boundingBox();
          const schedule = await page.locator(".studio-profile-hub").boundingBox();
          assert(avatar.width >= 190 && avatar.x < box.x + box.width / 2, "Large place photo is left aligned");
          assert(text.y >= avatar.y + avatar.height, "Place name sits below the photo");
          assert(about && schedule && schedule.x + schedule.width <= about.x, "About sits to the right of the profile and schedule");
          assert(Math.abs(about.y - box.y) < 2, "About starts level with the banner");
          assert.equal(await page.locator(".profile-share-cta").count(), 0, "Place sharing CTA is removed");
        } else {
          const group = route.startsWith("/g/");
          const avatar = await page.locator(group ? ".group-profile-photo" : ".profile-identity-lead .profav").boundingBox();
          const about = await page.locator(group ? ".group-profile-about" : "#profile-about").boundingBox();
          assert(avatar.width >= 190 && avatar.height >= 190, "Profile photo is large and square");
          assert(text.y >= avatar.y + avatar.height, "Profile name is below the photo");
          assert(about.x >= box.x + box.width && Math.abs(about.y - box.y) < 2, "About sits beside the banner");
        }
        assert(await title.evaluate(el => getComputedStyle(el).color !== getComputedStyle(el.parentElement).backgroundColor), "Profile name contrasts with its header");
        const more = page.getByRole("button", { name: route.startsWith("/g/") ? "More group actions" : "More profile actions", exact: true });
        assert(await more.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), "Profile action is not covered by the identity panel");
        await more.focus();
        await more.press("Enter");
        await centeredDialog(route.startsWith("/g/") ? "Group actions" : "Profile actions");
        await page.waitForFunction(el => el === document.activeElement, await more.elementHandle());
      }
      if (width === 1440) await page.screenshot({ path: `${output}/${route.replaceAll("/", "-").slice(1)}.png`, animations: "disabled" });
    }
    report.checks.push(`Direct calendars, profile actions, headers and rail at ${width}px`);
    console.log(`PASS desktop frame and profile actions at ${width}px`);
  }
  // Keep inline streaming scripts enabled while withholding external app
  // bundles. This checks the real server-rendered frame before hydration can
  // remove mobile surfaces and conceal a desktop CSS specificity regression.
  const initial = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  await initial.addCookies([{ name: "fl_session", value: f.owner.token, url: base, httpOnly: true, sameSite: "Lax" }]);
  await initial.route("**/*", route => route.request().resourceType() === "script" || new URL(route.request().url()).origin !== base ? route.abort() : route.continue());
  const firstPaint = await initial.newPage();
  for (const path of ["/calendar", "/calendar/following"]) {
    await firstPaint.goto(base + path);
    await firstPaint.getByRole("heading", { name: path === "/calendar" ? "Your calendar" : "Following", exact: true }).waitFor();
    await firstPaint.locator(".desktop-top-header").waitFor();
    assert.equal(await firstPaint.locator(".calendar-action-sheet:visible,.calendar-scope-hero:visible").count(), 0, "Server-rendered desktop hides mobile navigation surfaces");
    assert(await firstPaint.getByRole("button", { name: "Month view", exact: true }).isVisible(), "Desktop view controls appear before hydration");
    assert(await firstPaint.locator(".calendar-direct-schedule,.desktop-calendar-content").isVisible(), "Desktop schedule appears before hydration");
  }
  await initial.close();
  report.checks.push("Server-rendered desktop calendars and controls are visible with mobile surfaces hidden before hydration");
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const route of ["/discover", "/discover?half=studios", "/discover?half=groups", "/search", "/you", "/inbox", "/notifications", "/settings", "/coachshare", "/s/audit-studio/manage/calendar"]) {
    await visit(route); await frame();
  }
  report.checks.push("Discovery, search, profile, messages, notifications, settings, share and studio calendar retain the rail");
  await visit("/calendar");
  await page.getByRole("button", { name: "Share your week", exact: true }).click();
  await page.waitForURL("**/coachshare"); await page.locator(".shpage").waitFor(); await frame();
  assert.equal(await page.locator(".share-takeover-scrim").count(), 0, "Share uses its desktop page");
  await page.goBack(); await page.waitForURL("**/calendar"); await page.getByRole("heading", { name: "Your calendar", exact: true }).waitFor();
  await visit("/you");
  await page.waitForURL("**/calendar"); await page.getByRole("heading", { name: "Your calendar", exact: true }).waitFor(); await frame();
  assert.equal(await page.locator(".personal-calendar-scrim").count(), 0, "Personal calendar uses its desktop page");
  assert.equal(await page.locator(".youpage").count(),0,"Old account links resolve to the current desktop calendar");
  await rail.getByRole("link", { name: /^Notifications/ }).click();
  await page.waitForURL("**/notifications"); await page.getByRole("heading", { name: "Notifications", exact: true }).waitFor(); await frame();
  await page.goBack(); await page.waitForURL("**/calendar"); await page.getByRole("heading", {name:"Your calendar",exact:true}).waitFor();
  assert.equal(await rail.getByRole("link", { name: "Search", exact: true }).count(), 0, "Desktop discovery uses a single Discover link");
  await rail.getByRole("link", { name: "Discover", exact: true }).click();
  await page.waitForURL("**/discover"); await frame();
  report.checks.push("Share, personal calendar, Notifications and Discover navigate as pages; Back returns to their origins");

  await visit("/calendar");
  const chooser = rail.getByRole("button", { name: "Choose a calendar", exact: true });
  await chooser.click();
  const destinations = rail.getByRole("menuitem");
  assert.equal(await rail.locator('.desktop-calendar-menu > .selected').count(), 1, "Only your current calendar is selected");
  for (const destination of await destinations.all()) {
    assert(await destination.evaluate(el => { const r = el.getBoundingClientRect(), rail = el.closest(".desktop-left").getBoundingClientRect(); return r.x >= rail.x && r.right <= rail.right; }), "Calendar destination fits within the rail");
  }
  await destinations.filter({ hasText: "Studio calendar" }).click();
  await page.waitForURL("**/s/audit-studio/manage/calendar"); await page.getByRole("heading", { name: "Calendar", exact: true }).waitFor(); await frame();
  await chooser.click();
  await rail.getByRole("menuitem", { name: "Audit Group Group calendar", exact: true }).click();
  await page.waitForURL("**/g/audit-group");
  await rail.getByRole("button", { name: "Profile menu", exact: true }).click();
  await rail.getByRole("link", { name: "Settings", exact: true }).click();
  await page.waitForURL("**/settings");
  await visit("/calendar");
  const add = page.getByRole("button", { name: "Add", exact: true });
  await add.focus();
  await add.press("Enter"); await centeredDialog("Create");
  await page.waitForFunction(el => el === document.activeElement, await add.elementHandle());
  await visit("/s/audit-studio");
  await page.locator("#profile-about").waitFor(); await frame();
  assert.equal(await page.locator(".profile-info-scrim:visible").count(), 0, "Desktop About stays visible in the profile page");
  const cls = page.locator(".profile-calendar-list [data-cid]").first();
  await cls.click();
  const detail = page.locator(".sheet.clsfull");
  await detail.waitFor();
  const classBounds = await detail.boundingBox();
  assert(classBounds.y >= 24 && classBounds.y + classBounds.height <= 876, "Class dialog fits desktop");
  await page.keyboard.press("Escape"); await detail.waitFor({ state: "hidden" });
  report.checks.push("Managed calendars fit the rail; Add, profile actions and class details dismiss with focus; About stays inline");

  await visit("/calendar");
  await page.setViewportSize({ width: 939, height: 900 });
  await page.getByRole("button", { name: "Show your calendar", exact: true }).waitFor();
  assert(!(await rail.isVisible()), "Desktop header gives way to mobile navigation at 939px");
  await page.getByRole("button", { name: "Show your calendar", exact: true }).click();
  await page.locator(".personal-calendar-list").waitFor();
  await page.setViewportSize({ width: 940, height: 900 });
  await page.getByRole("button", { name: "Month view", exact: true }).waitFor(); await frame();
  report.checks.push("Resizing across 939/940px preserves the mobile reveal and desktop page controls");
  assert.deepEqual(errors, [], "No browser runtime errors");
  console.log(`PASS desktop workflows in ${browserName}`);
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: `${output}/failure.png`, animations: "disabled" });
    console.log("Desktop failure state", await page.evaluate(() => ({ path: location.pathname, headings: [...document.querySelectorAll("h1")].map(el => el.textContent), inert: [...document.querySelectorAll("[inert]")].map(el => el.className), dialogs: [...document.querySelectorAll('[role="dialog"]')].map(el => el.getAttribute("aria-label")), focused: document.activeElement?.className })));
  }
  throw error;
} finally {
  if (browser) await Promise.race([browser.close(), pause(3000)]);
  server.kill("SIGTERM");
  fs.closeSync(log);
  fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));
}
