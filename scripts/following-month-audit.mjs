import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { chromium, webkit, firefox } from "playwright";

const fixturePath = process.env.FOLLOWING_MONTH_FIXTURES || execFileSync(process.execPath, ["--import", "tsx", "scripts/following-month-fixtures.ts"], { env: { ...process.env, DATABASE_URL: "" }, encoding: "utf8" }).trim().split("\n").at(-1);
const f = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
assert(f.directory.includes("fittlist-month-audit-") && f.dataDir === `${f.directory}/db`, "Disposable month fixture required");
const port = Number(process.env.AUDIT_PORT || 3191), base = `http://localhost:${port}`;
const browserName = process.env.AUDIT_BROWSER || "chromium";
assert(["chromium", "webkit", "firefox"].includes(browserName), "Supported audit browser");
const report = { browser: browserName, checks: [], limits: ["Synthetic isolated PGlite data; no production accounts or service messages.", "Reads the existing production build; does not build, deploy, or publish."] };
const checkFilter = process.env.FOLLOWING_MONTH_CHECK_FILTER;
const output = `${f.directory}/following-month-${browserName}${checkFilter ? `-${checkFilter.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : ""}-report.json`;
const log = fs.openSync(`${f.directory}/server.log`, "w");
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], { env: { ...process.env, DATABASE_URL: "", PGLITE_DATA_DIR: f.dataDir, ALLOW_EMBEDDED_DB_IN_PRODUCTION: "true", SESSION_SECRET: f.secret, ADMIN_EMAILS: "", RESEND_API_KEY: "", BLOB_READ_WRITE_TOKEN: "", INVITE_ONLY: "false", FANS_ENABLED: "true", NEXT_PUBLIC_ORIGIN: base }, stdio: ["ignore", log, log] });
let browser;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const monthOf = iso => iso.slice(0, 7);
const actionMonth = request => request.method() === "POST" && request.headers()["next-action"] ? request.postData()?.match(/"(\d{4}-\d{2})"/)?.[1] : null;
async function checked(name, fn) {
  if (checkFilter && !name.includes(checkFilter)) return;
  const start = performance.now();
  try { const detail = await fn(); report.checks.push({ name, status: "passed", elapsedMs: Math.round(performance.now() - start), ...detail }); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({ name, status: "failed", elapsedMs: Math.round(performance.now() - start), message: String(error) }); console.log(`FAIL ${name}: ${error.message}`); }
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
}
async function context() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await context.addCookies([{ name: "fl_session", value: f.viewer.token, url: base, httpOnly: true, sameSite: "Lax" }]);
  await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  return { context, page };
}
async function openFollowing(page) {
  await page.goto(`${base}/calendar/following`);
  await page.getByRole("navigation", { name: "Calendar view", exact: true }).waitFor();
  const reveal = page.getByRole("button", { name: "Show Explore calendar", exact: true });
  if (await reveal.isVisible()) await reveal.click();
}
async function showMonth(page, ym, loaded = true) {
  const switcher = page.getByRole("button", { name: "Switch to month view", exact: true });
  if (await switcher.isVisible()) await switcher.click();
  const block = page.locator(`#month-${ym}`);
  await block.waitFor();
  await block.evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
  if (loaded) await page.waitForFunction(id => document.getElementById(id)?.dataset.loadState === "loaded", `month-${ym}`);
  if (loaded && ym === monthOf(f.dates.far)) await page.screenshot({ path: `${f.directory}/${browserName}-future-month.png`, animations: "disabled" });
  return block;
}
async function openDate(page, iso, classId, checkCardLayout = true) {
  await showMonth(page, monthOf(iso));
  await page.getByRole("button", { name: `Open ${iso}`, exact: true }).click();
  const day = page.locator(`#feed-day-${iso}`);
  await day.waitFor();
  await page.waitForFunction(id => { const r = document.getElementById(id)?.getBoundingClientRect(); return !!r && r.top < innerHeight && r.bottom > 0; }, `feed-day-${iso}`);
  await page.waitForTimeout(300);
  if (iso === f.dates.far) await page.screenshot({ path: `${f.directory}/${browserName}-future-date.png`, animations: "disabled" });
  const heading = await day.locator("h2").boundingBox();
  assert(heading && heading.y >= -1 && heading.y < 800, `Selected date heading remains visible after layout settles: ${iso} at ${heading?.y}`);
  if (classId) assert.equal(await day.locator(`[data-cid="${classId}"]`).count(), 1, "Selected occurrence is present exactly once");
  const coach = day.locator(".explore-class-coach").first();
  const firstCoach = await coach.count() ? await coach.boundingBox() : null;
  if (checkCardLayout && firstCoach) assert(firstCoach.y >= heading.y + heading.height - 1, `First class coach row clears its sticky date heading: ${iso}, coach ${firstCoach.y}, heading bottom ${heading.y + heading.height}`);
  return day;
}
async function noDuplicates(page) {
  const keys = await page.locator(".cash-activity-list [data-cid][data-d]").evaluateAll(rows => rows.map(row => `${row.dataset.cid}:${row.dataset.d}`));
  assert.equal(new Set(keys).size, keys.length, "No duplicate class/date occurrences");
  return keys.length;
}
try {
  let ready = false;
  for (let i = 0; i < 120; i++) { if (server.exitCode !== null) throw Error("Local month server exited; inspect local log"); try { if ((await fetch(base)).ok) { ready = true; break; } } catch {} await pause(500); }
  assert(ready, "Local month server ready");
  browser = await ({ chromium, webkit, firefox }[browserName]).launch(browserName === "chromium" && process.env.AUDIT_CHROME_CHANNEL ? { channel: process.env.AUDIT_CHROME_CHANNEL } : {});

  await checked("Beyond 30 and 180 days: recurring, dated, empty, and deduplicated", async () => {
    const { context: c, page } = await context();
    const requests = []; page.on("request", request => { const ym = actionMonth(request); if (ym) requests.push(ym); });
    try {
      await openFollowing(page); await showMonth(page, monthOf(f.iso));
      await pause(300);
      assert(!requests.includes(monthOf(f.dates.far)), "Distant months are not fetched on first reveal");
      assert(new Set(requests).size < 6, "Only a visible month window is fetched, not all twelve months");
      await openDate(page, f.dates.near, f.classes["Month Recurring A"]);
      await openDate(page, f.dates.nearDated, f.classes["Month Dated Near"]);
      await openDate(page, f.dates.far, f.classes["Month Recurring A"]);
      await openDate(page, f.dates.farDated, f.classes["Month Dated Far"]);
      await openDate(page, f.dates.groupFar, f.classes["Month Group Far"]);
      const empty = await openDate(page, f.dates.empty);
      assert.equal(await empty.getByText("No classes on this day.", { exact: true }).count(), 1);
      await openDate(page, f.dates.nearDated, f.classes["Month Dated Near"]);
      const rows = await noDuplicates(page);
      return { nearDate: f.dates.near, farDate: f.dates.far, datedClasses: 2, groupOnlyFarDate: f.dates.groupFar, emptyDate: f.dates.empty, renderedRows: rows, requestedMonths: [...new Set(requests)] };
    } finally { await c.close(); }
  });

  await checked("Failed distant month stays explicit and retries successfully", async () => {
    const { context: c, page } = await context();
    const ym = monthOf(f.dates.far); let failures = 0;
    let releaseFailure;
    const failureGate = new Promise(resolve => { releaseFailure = resolve; });
    await page.route("**/calendar/following", async route => {
      if (actionMonth(route.request()) === ym && failures === 0) { failures++; await failureGate; await route.abort("failed"); } else await route.continue();
    });
    try {
      await openFollowing(page);
      const block = await showMonth(page, ym, false);
      await block.getByRole("button", { name: `Open ${f.dates.far}`, exact: true }).click();
      releaseFailure();
      await page.waitForFunction(id => document.getElementById(id)?.dataset.loadState === "error", `month-${ym}`);
      assert(await block.isVisible(), "An unloaded date stays in month view when its request fails");
      assert.equal(await page.getByText("No classes on this day.", { exact: true }).count(), 0, "Failure is not rendered as an empty day");
      await block.getByRole("button", { name: /^Retry / }).click();
      const selected = page.locator(`#feed-day-${f.dates.far}`);
      await selected.waitFor();
      assert.equal(await selected.locator(`[data-cid="${f.classes["Month Recurring A"]}"]`).count(), 1, "Retry opens the date originally selected");
      return { simulatedFailures: failures, retryLoaded: true };
    } finally { releaseFailure(); await c.close(); }
  });

  await checked("Day list continues past the initially loaded window", async () => {
    const { context: c, page } = await context();
    try {
      await openFollowing(page);
      const initialMonth = monthOf(f.iso);
      await page.waitForFunction(() => document.querySelector(".cash-days-more") || [...document.querySelectorAll("button")].some(button => button.textContent.trim() === "Show more dates"));
      for (let i = 0; i < 12; i++) {
        const sentinel = page.locator(".cash-days-more");
        if (await sentinel.count()) { const before = await page.locator(".cash-day").count(); await sentinel.scrollIntoViewIfNeeded(); await page.waitForFunction(n => document.querySelectorAll(".cash-day").length > n || !document.querySelector(".cash-days-more"), before); }
        else break;
      }
      const more = page.getByRole("button", { name: "Show more dates", exact: true });
      await more.waitFor();
      const before = await page.locator(".cash-day").last().getAttribute("id");
      await more.click();
      await page.waitForFunction(previous => [...document.querySelectorAll(".cash-day")].at(-1)?.id > previous, before);
      const after = await page.locator(".cash-day").last().getAttribute("id");
      const rows = await noDuplicates(page);
      return { initialMonth, previousLastDate: before, continuedLastDate: after, renderedRows: rows };
    } finally { await c.close(); }
  });

  await checked("Loaded distant data survives background remainder completion", async () => {
    const { context: c, page } = await context();
    let release, held = false, farRequested = false;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route("**/calendar/following", async route => {
      const request = route.request();
      if (actionMonth(request) === monthOf(f.dates.far)) farRequested = true;
      if (!held && request.method() === "POST" && request.headers()["next-action"] && request.postData()?.trim() === "[]") {
        held = true; const response = await route.fetch(); await gate; await route.fulfill({ response });
      } else await route.continue();
    });
    try {
      await openFollowing(page); await showMonth(page, monthOf(f.dates.far), false);
      // Bound the delay: server-action queues can serialize the background
      // request and the month request, making inverted completion impossible.
      await pause(1200);
      assert(held, "Captured the initial background remainder response");
      const beforeRelease = await page.locator(`#month-${monthOf(f.dates.far)}`).getAttribute("data-load-state");
      const requestedBeforeRelease = farRequested;
      release();
      await openDate(page, f.dates.far, f.classes["Month Recurring A"]);
      await openDate(page, f.dates.near, f.classes["Month Recurring A"]);
      await openDate(page, f.dates.far, f.classes["Month Recurring A"]);
      return { heldBackgroundResponse: held, farRequestedWhileHeld: requestedBeforeRelease, distantLoadedBeforeRelease: beforeRelease === "loaded", backgroundOrder: beforeRelease === "loaded" ? "distant month completed first" : "server actions serialized; retention checked after completion", renderedRows: await noDuplicates(page) };
    } finally { release(); await c.close(); }
  });

  await checked("Saving a distant occurrence retains its selected date and class", async () => {
    const { context: c, page } = await context();
    let monthRequests = 0;
    const pendingActions = new Map();
    const responses = [], errors = [];
    const pendingHttp = new Map();
    const actionLabel = request => actionMonth(request) || (request.postData()?.includes(f.dates.far) ? "save occurrence" : "background action");
    page.on("request", request => { pendingHttp.set(request, { method: request.method(), path: new URL(request.url()).pathname, rsc: !!request.headers().rsc }); if (actionMonth(request) === monthOf(f.dates.far)) monthRequests++; if (request.headers()["next-action"]) pendingActions.set(request, actionLabel(request)); });
    page.on("response", async response => { if (response.request().headers()["next-action"]) { const result = { action: actionLabel(response.request()), status: response.status() }; responses.push(result); if (result.action === "save occurrence") result.ok = /"ok"\s*:\s*true/.test(await response.text()); } });
    page.on("pageerror", error => errors.push(error.message.slice(0, 200)));
    page.on("requestfinished", request => { pendingActions.delete(request); pendingHttp.delete(request); });
    page.on("requestfailed", request => { pendingActions.delete(request); pendingHttp.delete(request); });
    try {
      await openFollowing(page);
      // Card alignment has its own assertions in the navigation scenarios.
      const day = await openDate(page, f.dates.far, f.classes["Month Recurring A"], false);
      const before = monthRequests;
      const saveStart = performance.now();
      await day.getByRole("button", { name: "Save to your plans", exact: true }).click();
      await day.locator('.explore-save-button[aria-pressed="true"]').waitFor();
      try {
        await page.waitForFunction(selector => { const button = document.querySelector(selector); return button && button.getAttribute("aria-busy") === "false"; }, `#feed-day-${f.dates.far} .explore-save-button`, { polling: 50 });
      } catch (error) {
        await page.screenshot({ path: `${f.directory}/${browserName}-save-failure.png`, animations: "disabled" });
        const buttons = await day.locator(".explore-save-button").evaluateAll(elements => elements.map(el => ({ busy: el.getAttribute("aria-busy"), pressed: el.getAttribute("aria-pressed"), disabled: el.disabled, text: el.textContent })));
        throw new Error(`${error.message}; buttons: ${JSON.stringify(buttons)}; pending actions: ${JSON.stringify([...pendingActions.values()])}; pending HTTP: ${JSON.stringify([...pendingHttp.values()])}; responses: ${JSON.stringify(responses)}; page errors: ${JSON.stringify(errors)}; far-month requests: ${monthRequests}`);
      }
      console.log("Save settled", JSON.stringify({ elapsedMs: Math.round(performance.now() - saveStart), responses: responses.filter(response => response.action === "save occurrence") }));
      const closeSave = page.locator('.saveeducation .confirm-keep, [aria-labelledby="postsave-title"] .sheet-dismiss');
      if (await closeSave.isVisible()) await closeSave.click();
      await page.waitForTimeout(300);
      assert.equal(await day.locator(`[data-cid="${f.classes["Month Recurring A"]}"]`).count(), 1);
      const heading = await day.locator("h2").boundingBox();
      assert(heading && heading.y >= -1 && heading.y < 800, "Selected date remains visible after saving");
      return { saved: true, farMonthRefetchedAfterSave: monthRequests > before, monthRequests, renderedRows: await noDuplicates(page) };
    } finally { await c.close(); }
  });

  await checked("Search close refresh refetches the selected future month", async () => {
    const { context: c, page } = await context();
    let monthRequests = 0;
    page.on("request", request => { if (actionMonth(request) === monthOf(f.dates.far)) monthRequests++; });
    try {
      await openFollowing(page);
      await openDate(page, f.dates.far, f.classes["Month Recurring A"]);
      const before = monthRequests;
      await page.getByRole("button", { name: "Show Explore", exact: true }).click();
      await page.getByRole("button", { name: "Search FittList", exact: true }).click();
      await page.getByRole("dialog", { name: "Search", exact: true }).waitFor();
      const refreshedMonth = page.waitForResponse(response => actionMonth(response.request()) === monthOf(f.dates.far));
      await page.getByRole("button", { name: "Close search", exact: true }).click();
      await page.getByRole("dialog", { name: "Search", exact: true }).waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "Show Explore calendar", exact: true }).click();
      const day = page.locator(`#feed-day-${f.dates.far}`);
      await refreshedMonth;
      await day.locator(`[data-cid="${f.classes["Month Recurring A"]}"]`).waitFor();
      for (let i = 0; i < 50 && monthRequests <= before; i++) await pause(100);
      assert(monthRequests > before, "A new server seed triggers a fresh month request");
      await page.waitForTimeout(300);
      const heading = await day.locator("h2").boundingBox();
      await page.screenshot({ path: `${f.directory}/${browserName}-after-search-refresh.png`, animations: "disabled" });
      assert(heading && heading.y >= -1 && heading.y < 800, `Selected date is restored after the refreshed calendar opens; heading at ${heading?.y}`);
      return { farMonthRefetched: true, previousMonthRequests: before, currentMonthRequests: monthRequests, renderedRows: await noDuplicates(page) };
    } finally { await c.close(); }
  });
} finally {
  if (browser) await browser.close(); server.kill("SIGTERM"); fs.closeSync(log);
  fs.writeFileSync(output, JSON.stringify(report, null, 2)); console.log(`Sanitized month audit report: ${output}`);
}
if (report.checks.some(check => check.status !== "passed")) process.exitCode = 1;
