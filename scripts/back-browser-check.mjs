import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { chromium, webkit } from "playwright";

const fixturePath = execFileSync(process.execPath, ["--import", "tsx", "scripts/audit-fixtures.ts"], { env: { ...process.env, DATABASE_URL: "" }, encoding: "utf8" }).trim().split("\n").at(-1);
const f = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
assert(f.directory.includes("fittlist-audit-") && f.dataDir === `${f.directory}/db`);
const base = "http://localhost:3195";
const browserName = process.env.AUDIT_BROWSER || "chromium";
assert(["chromium", "webkit"].includes(browserName));
const log = fs.openSync(`${f.directory}/back-server.log`, "w");
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3195"], { env: { ...process.env, DATABASE_URL: "", PGLITE_DATA_DIR: f.dataDir, SESSION_SECRET: f.secret, ALLOW_EMBEDDED_DB_IN_PRODUCTION: "true", BLOB_READ_WRITE_TOKEN: "", RESEND_API_KEY: "", ADMIN_EMAILS: "", INVITE_ONLY: "false", FANS_ENABLED: "true", NEXT_PUBLIC_ORIGIN: base }, stdio: ["ignore", log, log] });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    assert.equal(server.exitCode, null);
    try { if ((await fetch(base)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(ready, "Local banner server ready");
  browser = await ({ chromium, webkit }[browserName]).launch();
  async function open(width, path) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
    await context.addCookies([{ name: "fl_session", value: f.owner.token, url: base, httpOnly: true, sameSite: "Lax" }]);
    await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const page = await context.newPage(); page.setDefaultTimeout(20000);
    await page.goto(base + path);
    return { context, page };
  }
  const studio = "/s/audit-studio", admin = `${studio}/manage`, calendar = `${admin}/calendar`;
  async function at(page, path) {
    await page.waitForURL(url => url.pathname === path);
    await page.locator(path === studio ? '.profback button' : '.studio-manage-back').first().waitFor();
  }
  async function openAdmin(page) {
    const link = page.getByRole("link", { name: "Admin dashboard", exact: true });
    if (!await link.isVisible()) await page.getByRole("button", { name: "More profile actions", exact: true }).click();
    await link.click(); await at(page, admin);
  }
  async function back(page, path) {
    await page.locator('.studio-manage-back').first().click(); await at(page, path);
  }
  const setup = await open(1440, calendar);
  await setup.page.getByRole("button", { name: "Start managing the calendar", exact: true }).click();
  await setup.page.locator('.rota-month-board').waitFor();
  await setup.context.close();

  for (const width of [393, 1440]) {
    const { context, page } = await open(width, studio);
    try {
      await openAdmin(page);
      await page.locator('.studio-dashboard-card').filter({ hasText: "Calendar" }).first().click(); await at(page, calendar);
      if (width === 1440) {
        await page.getByRole("button", { name: "Next month", exact: true }).click();
        await page.getByRole("button", { name: "Next month", exact: true }).click();
      }
      await page.reload(); await at(page, calendar);
      await back(page, admin); await back(page, studio);
      // Forward must restore an entry, not be mis-recorded as another Back.
      await page.goForward(); await at(page, admin);
      await page.goForward(); await at(page, calendar);
      await back(page, admin); await back(page, studio);
      if (width === 1440) {
        await openAdmin(page);
        await page.locator('.studio-dashboard-card').filter({ hasText: "Calendar" }).first().click(); await at(page, calendar);
        await page.getByRole("navigation", { name: "Studio administration" }).getByRole("link", { name: "Overview", exact: true }).click(); await at(page, admin);
        await back(page, studio);
      }
      console.log(`PASS ${browserName} ${width}: studio → admin → calendar, refresh, month entries, browser Forward, and Back without loops`);
    } finally { await context.close(); }

    const cold = await open(width, calendar);
    try {
      await at(cold.page, calendar);
      const depth = await cold.page.evaluate(() => history.length);
      await back(cold.page, admin); await back(cold.page, studio);
      await cold.page.locator('.profback button').first().click();
      await cold.page.waitForURL(url => url.pathname === "/calendar/following");
      assert.equal(await cold.page.evaluate(() => history.length), depth, "Fallback Back never adds history entries");
      console.log(`PASS ${browserName} ${width}: cold calendar → admin → studio → Following with no added history`);
    } finally { await cold.context.close(); }
  }
  const origin = await open(1440, "/calendar");
  try {
    const page = origin.page;
    await page.getByRole("button", { name: "Choose a calendar", exact: true }).click();
    await page.getByRole("menuitem", { name: /Audit Studio/ }).click(); await at(page, admin);
    await page.locator('.studio-dashboard-card').filter({ hasText: "Calendar" }).first().click(); await at(page, calendar);
    await back(page, admin);
    await page.locator('.studio-manage-back').click();
    await page.waitForURL(url => url.pathname === "/calendar");
    await page.locator('.calendar-summary-heading').waitFor();
    console.log(`PASS ${browserName}: admin returns to the personal calendar when opened from its dropdown`);
  } finally { await origin.context.close(); }
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  fs.closeSync(log);
}
