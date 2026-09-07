import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";

if (process.env.DATABASE_URL || process.env.VERCEL) throw new Error("Notification browser audit is local only");
assert(fs.existsSync(".next/BUILD_ID"), "Build the current app before the notification browser audit");
const seed = spawnSync(process.execPath, ["--import", "tsx", "scripts/notification-audit-fixtures.ts"], { env: { ...process.env, DATABASE_URL: "" }, encoding: "utf8", timeout: 30000 });
assert.equal(seed.status, 0, seed.stderr);
const fixturePath = seed.stdout.trim().split("\n").at(-1);
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const port = 3188;
const base = `http://localhost:${port}`;
const log = fs.openSync(`${fixture.directory}/server.log`, "w");
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  env: { ...process.env, DATABASE_URL: "", SESSION_SECRET: fixture.secret, PGLITE_DATA_DIR: fixture.dataDir,
    ALLOW_EMBEDDED_DB_IN_PRODUCTION: "true", INVITE_ONLY: "false", FANS_ENABLED: "true", NEXT_PUBLIC_ORIGIN: base,
    RESEND_API_KEY: "", BLOB_READ_WRITE_TOKEN: "", VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "", CRON_SECRET: "", ADMIN_EMAILS: "" },
  stdio: ["ignore", log, log],
});
const manifest = JSON.parse(fs.readFileSync(".next/server/server-reference-manifest.json", "utf8"));
const actionId = (name) => Object.entries(manifest.node).find(([, value]) => value.filename === "app/actions/notifications.ts" && value.exportedName === name)?.[0];
const loadId = actionId("loadNotificationSheet");
const unreadId = actionId("hasNewNotifications");
let browser;
const checks = [];
const deadline = Date.now() + 180000;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, maxMs = 15000) {
  const end = Math.min(deadline, Date.now() + maxMs);
  let last;
  while (Date.now() < end) {
    try { if (await check()) return; } catch (error) { last = error; }
    await pause(100);
  }
  throw new Error(`Timed out: ${label}${last ? ` (${last.message})` : ""}`);
}
async function unread(context) {
  const response = await context.request.post(`${base}/calendar`, { headers: { "Next-Action": unreadId, "Content-Type": "text/plain;charset=UTF-8", Origin: base }, data: "[]" });
  assert.equal(response.status(), 200);
  const result = (await response.text()).split("\n").find((line) => /^1:/.test(line));
  assert(result && !result.startsWith("1:E"), "Unread action must return a value");
  return JSON.parse(result.slice(2));
}
async function contextFor(who) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await context.addCookies([{ name: "fl_session", value: fixture[who].token, url: base, httpOnly: true, sameSite: "Lax" }]);
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin === base || url.protocol === "data:" ? route.continue() : route.abort();
  });
  return context;
}
async function rows(page, expected) {
  await until(async () => (await page.locator(".notifrow .nm").count()) === expected.length, `${expected.length} notification rows`);
  const titles = await page.locator(".notifrow .nm").allTextContents();
  assert.deepEqual(titles, expected);
  assert.equal(new Set(titles).size, titles.length, "Notification pages must not duplicate rows");
}
async function failNextLoad(context, more) {
  let failed = false;
  const handler = async (route) => {
    const request = route.request();
    const matches = !failed && request.method() === "POST" && request.headers()["next-action"] === loadId && request.postData()?.includes("createdAt") === more;
    if (matches) {
      failed = true;
      await route.fulfill({ status: 503, contentType: "text/plain", body: "Simulated notification outage" });
    } else await route.fallback();
  };
  await context.route(`${base}/**`, handler);
  return { happened: () => failed, stop: () => context.unroute(`${base}/**`, handler) };
}

try {
  assert(loadId && unreadId, "Notification actions must be present in the current build");
  await until(async () => {
    if (server.exitCode !== null) throw new Error(`Audit server exited ${server.exitCode}`);
    return (await fetch(base, { signal: AbortSignal.timeout(1000) })).ok;
  }, "isolated notification server", 30000);
  browser = await chromium.launch({ ...(process.env.AUDIT_CHROME_CHANNEL ? { channel: process.env.AUDIT_CHROME_CHANNEL } : {}), headless: true });
  const first = await contextFor("viewer");
  const page = await first.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(`${base}/notifications`);
  await rows(page, fixture.titles.slice(0, 50));
  assert.equal(await unread(first), true, "Unloaded notifications must keep the unread badge active");
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await rows(page, fixture.titles);
  assert.equal(await page.getByRole("button", { name: "Load more", exact: true }).count(), 0);
  await until(async () => !(await unread(first)), "acknowledgement after all rows display");
  checks.push("Legacy page displays exactly 50 then 57 rows in order, without duplicates; unread remains until older rows display");
  await page.screenshot({ path: `${fixture.directory}/notifications-page.png`, animations: "disabled" });

  await page.goto(`${base}/calendar`);
  await page.getByRole("button", { name: "Notifications", exact: true }).first().click();
  await rows(page, fixture.titles.slice(0, 50));
  const failedMore = await failNextLoad(first, true);
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await page.getByRole("button", { name: "Try again", exact: true }).waitFor();
  assert(failedMore.happened(), "Load-more outage must actually be injected");
  await rows(page, fixture.titles.slice(0, 50));
  await failedMore.stop();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await rows(page, fixture.titles);
  checks.push("Sheet failed load-more preserves first page and cursor; retry appends exactly seven remaining rows");
  await page.screenshot({ path: `${fixture.directory}/notifications-sheet.png`, animations: "disabled" });
  await page.getByRole("button", { name: "Close notifications", exact: true }).click();
  const failedRefresh = await failNextLoad(first, false);
  await page.getByRole("button", { name: "Notifications", exact: true }).first().click();
  await page.getByRole("button", { name: "Try again", exact: true }).waitFor();
  assert(failedRefresh.happened());
  await rows(page, fixture.titles.slice(0, 50));
  await failedRefresh.stop();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByRole("button", { name: "Load more", exact: true }).waitFor();
  await rows(page, fixture.titles.slice(0, 50));
  checks.push("Cached reopen preserves visible first page on refresh failure; retry refreshes first page rather than skipping ahead");
  await first.close();

  const second = await contextFor("other");
  const otherPage = await second.newPage();
  otherPage.setDefaultTimeout(15000);
  await otherPage.goto(`${base}/calendar`);
  const failedInitial = await failNextLoad(second, false);
  await otherPage.getByRole("button", { name: "Notifications", exact: true }).first().click();
  await otherPage.getByRole("button", { name: "Try again", exact: true }).waitFor();
  assert(failedInitial.happened());
  assert.equal(await otherPage.locator(".notifrow").count(), 0);
  assert.equal(await unread(second), true, "Failed initial load must not acknowledge anything");
  await failedInitial.stop();
  await otherPage.getByRole("button", { name: "Try again", exact: true }).click();
  await rows(otherPage, ["Other viewer 3", "Other viewer 2", "Other viewer 1"]);
  await until(async () => !(await unread(second)), "second viewer acknowledges their own displayed rows");
  checks.push("Failed initial load preserves unread state; retry displays only the authenticated viewer's notifications");
  await second.close();
  fs.writeFileSync(`${fixture.directory}/report.json`, JSON.stringify({ passed: checks, fixturePath, screenshots: ["notifications-page.png", "notifications-sheet.png"] }, null, 2));
  console.log(JSON.stringify({ passed: checks, artifacts: fixture.directory }, null, 2));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => server.once("exit", resolve)), pause(3000)]);
  if (server.exitCode === null) server.kill("SIGKILL");
  fs.closeSync(log);
}
