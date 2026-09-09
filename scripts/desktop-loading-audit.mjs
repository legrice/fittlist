import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { chromium } from "playwright";

const fixturePath = execFileSync(process.execPath, ["--import", "tsx", "scripts/audit-fixtures.ts"], { env: { ...process.env, DATABASE_URL: "" }, encoding: "utf8" }).trim().split("\n").at(-1);
const f = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
assert(f.directory.includes("fittlist-audit-") && f.dataDir === `${f.directory}/db`, "Disposable fixtures required");
const base = "http://localhost:3193";
const log = fs.openSync(`${f.directory}/loading-server.log`, "w");
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3193"], { env: { ...process.env, DATABASE_URL: "", PGLITE_DATA_DIR: f.dataDir, SESSION_SECRET: f.secret, ALLOW_EMBEDDED_DB_IN_PRODUCTION: "true", RESEND_API_KEY: "", BLOB_READ_WRITE_TOKEN: "", ADMIN_EMAILS: "", INVITE_ONLY: "false", FANS_ENABLED: "true", NEXT_PUBLIC_ORIGIN: base }, stdio: ["ignore", log, log] });
const actions = JSON.parse(fs.readFileSync(".next/server/server-reference-manifest.json", "utf8")).node;
const actionName = request => actions[request.headers()["next-action"]]?.exportedName;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { checks: [], limits: ["Isolated synthetic data and simulated transport faults; no production data or emails."] };
let browser;
async function check(name, run) {
  const start = performance.now();
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await context.addCookies([{ name: "fl_session", value: f.owner.token, url: base, httpOnly: true, sameSite: "Lax" }]);
  await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  try { await run(page, context); report.checks.push({ name, status: "passed", elapsedMs: Math.round(performance.now() - start) }); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({ name, status: "failed", error: error.message }); console.log(`FAIL ${name}: ${error.message}`); await page.screenshot({ path: `${f.directory}/loading-failure-${report.checks.length}.png` }); }
  finally {
    // URL changes can precede the streamed page response. Drain released
    // fault-injection handlers before disposing their request context.
    await page.unrouteAll({ behavior: "wait" });
    await context.unrouteAll({ behavior: "wait" });
    await context.close();
  }
}
try {
  let ready = false;
  for (let i = 0; i < 120; i++) { assert.equal(server.exitCode, null); try { if ((await fetch(base)).ok) { ready = true; break; } } catch {} await pause(500); }
  assert(ready, "Audit server ready");
  browser = await chromium.launch();
  await check("Navigation dots animate and honor reduced motion", async page => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.goto(`${base}/calendar`);
    await page.route(url => url.origin === base && url.pathname === "/discover", async route => {
      const response = await route.fetch(); await gate; await route.fulfill({ response }).catch(() => {});
    });
    try {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.locator('.desktop-top-header').getByRole("link", { name: "Discover", exact: true }).click();
      const dot = page.locator('.desktop-nav-link .link-pending-dots > span').first();
      await dot.waitFor();
      assert.equal(await dot.evaluate(el => getComputedStyle(el).animationName), "calendar-loading-dance");
      await page.screenshot({ path: `${f.directory}/desktop-loading-dots.png` });
      await page.emulateMedia({ reducedMotion: "reduce" });
      assert.equal(await dot.evaluate(el => getComputedStyle(el).animationName), "none");
      release(); await page.waitForURL("**/discover");
      await page.locator(".discover-results-workspace").waitFor();
    } finally { release(); }
  });
  await check("Directory API requires sign-in, stays private and rejects invalid input", async (page, context) => {
    assert.equal((await fetch(`${base}/api/directory?kind=people`)).status, 401);
    for (const query of ["kind=unknown", "kind=people&miles=999", "kind=places&lat=91&lng=0", "kind=search&q=" + "x".repeat(201)]) assert.equal((await context.request.get(`${base}/api/directory?${query}`)).status(), 400);
    const response = await context.request.get(`${base}/api/directory?kind=search&q=Audit`);
    assert.equal(response.status(), 200); assert.match(response.headers()["cache-control"], /private, no-store/);
    const result = await response.json();
    assert(result.studios.some(row => row.name === "Audit Studio"));
    assert(!JSON.stringify(result).includes("CONFIDENTIAL"), "Private classes remain absent");
  });
  await check("Stalled search shows dots, times out, and retries while the old response remains held", async page => {
    let held = false, release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route("**/api/directory?**", async route => {
      if (!held && new URL(route.request().url()).searchParams.get("kind") === "search") {
        held = true;
        const response = await route.fetch(); await gate;
        await route.fulfill({ response }).catch(() => {});
      } else await route.continue();
    });
    try {
      await page.goto(`${base}/search?q=Audit`);
      await page.getByRole("status", { name: "Searching…", exact: true }).waitFor();
      assert.equal(await page.locator('.loading-dots > span').first().evaluate(el => getComputedStyle(el).animationName), "none", "Reduced motion disables dancing");
      await page.getByRole("heading", { name: "Search is unavailable" }).waitFor();
      assert(held);
      await page.getByRole("button", { name: "Try again", exact: true }).click();
      await page.locator('.srchsec .disrow').getByText("Audit Studio", { exact: true }).waitFor({ timeout: 8000 });
      assert.equal(await page.getByRole("heading", { name: "Search is unavailable" }).count(), 0);
    } finally { release(); }
  });
  await check("A newer search completes before an older held query", async page => {
    let release, held = false;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route("**/api/directory?**", async route => {
      if (new URL(route.request().url()).searchParams.get("q") === "Aud") {
        held = true; const response = await route.fetch(); await gate; await route.fulfill({ response }).catch(() => {});
      } else await route.continue();
    });
    try {
      await page.goto(`${base}/search?q=Aud`);
      await page.getByRole("status", { name: "Searching…", exact: true }).waitFor();
      for (let i=0; !held && i<30; i++) await pause(100);
      assert(held);
      const input = page.getByRole("searchbox", { name: "Search FittList", exact: true });
      await input.fill("Audit Studio"); await input.press("Enter");
      await page.locator('.srchsec .disrow').getByText("Audit Studio", { exact: true }).waitFor({ timeout: 8000 });
      release(); await pause(300);
      assert.equal(await page.locator('.srchsec').getByText("Audit Coach", { exact: true }).count(), 0, "Late old query cannot replace current results");
    } finally { release(); }
  });
  await check("Discover failed directory retries and does not prefetch every profile", async page => {
    let failed = false;
    const profilePrefetches = [];
    page.on("request", request => { if (request.headers()["next-router-prefetch"] && /\/(auditcoach|auditmember|s\/|g\/)/.test(new URL(request.url()).pathname)) profilePrefetches.push(new URL(request.url()).pathname); });
    await page.route("**/api/directory?**", route => { if (!failed) { failed = true; return route.abort(); } return route.continue(); });
    await page.goto(`${base}/discover`);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.locator('.discover-person-grid,.discover-results-column .discover-tab-empty').first().waitFor();
    assert.equal(await page.getByRole("button", { name: "Try again", exact: true }).count(), 0);
    await pause(500); assert.equal(profilePrefetches.length, 0);
  });
  await check("Add recovers from a failed composer read", async page => {
    let failed = false;
    await page.route("**/*", route => { if (!failed && actionName(route.request()) === "globalComposerData") { failed = true; return route.abort(); } return route.fallback(); });
    await page.goto(`${base}/calendar`);
    const add = page.getByRole("button", { name: "Add", exact: true });
    await add.click();
    await page.getByText("Couldn’t open Add. Please try again.", { exact: true }).waitFor();
    await add.click(); await page.getByRole("dialog", { name: "Create", exact: true }).waitFor();
  });
  await check("Studio month failure releases loading and retry preserves the calendar", async page => {
    await page.goto(`${base}/s/audit-studio/manage/calendar`);
    await page.getByRole("button", { name: "Start managing the calendar", exact: true }).click();
    await page.locator('.rota-month-board').waitFor();
    const previous = await page.locator('.rota-month-nav strong').innerText();
    let failed = false;
    await page.route("**/*", route => { if (!failed && actionName(route.request()) === "gymMonth") { failed = true; return route.abort(); } return route.fallback(); });
    await page.getByRole("button", { name: "Next month", exact: true }).click();
    await page.getByRole("button", { name: "Try again", exact: true }).waitFor();
    assert.equal(await page.locator('.rota-month-board.loading').count(), 0);
    assert.equal(await page.locator('.rota-month-nav strong').innerText(), previous);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.waitForFunction(previous => document.querySelector('.rota-month-nav strong')?.textContent !== previous, previous);
    assert.equal(await page.getByRole("button", { name: "Try again", exact: true }).count(), 0);
  });
} finally {
  await browser?.close(); server.kill("SIGTERM"); fs.closeSync(log);
  fs.writeFileSync(`${f.directory}/desktop-loading-report.json`, JSON.stringify(report, null, 2));
  console.log(`Report: ${f.directory}/desktop-loading-report.json`);
}
if (report.checks.some(check => check.status === "failed")) process.exitCode = 1;
