import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { chromium, webkit } from "playwright";

const fixturePath = execFileSync(process.execPath, ["--import", "tsx", "scripts/audit-fixtures.ts"], { env: { ...process.env, DATABASE_URL: "" }, encoding: "utf8" }).trim().split("\n").at(-1);
const f = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
assert(f.directory.includes("fittlist-audit-") && f.dataDir === `${f.directory}/db`);
const base = "http://localhost:3194";
const browserName = process.env.AUDIT_BROWSER || "chromium";
assert(["chromium", "webkit"].includes(browserName));
const log = fs.openSync(`${f.directory}/banner-server.log`, "w");
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3194"], { env: { ...process.env, DATABASE_URL: "", PGLITE_DATA_DIR: f.dataDir, SESSION_SECRET: f.secret, ALLOW_EMBEDDED_DB_IN_PRODUCTION: "true", BLOB_READ_WRITE_TOKEN: "", RESEND_API_KEY: "", ADMIN_EMAILS: "", INVITE_ONLY: "false", FANS_ENABLED: "true", NEXT_PUBLIC_ORIGIN: base }, stdio: ["ignore", log, log] });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    assert.equal(server.exitCode, null);
    try { if ((await fetch(base)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(ready, "Local banner server ready");
  // A detailed portrait phone photo starts well above the upload limit.
  const buffer = await sharp(randomBytes(3072 * 4096 * 3), { raw: { width: 3072, height: 4096, channels: 3 } }).jpeg({ quality: 98 }).toBuffer();
  assert(buffer.length > 3_000_000);
  browser = await ({ chromium, webkit }[browserName]).launch();
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, reducedMotion: "reduce", serviceWorkers: "block" });
  await context.addCookies([{ name: "fl_session", value: f.owner.token, url: base, httpOnly: true, sameSite: "Lax" }]);
  await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const actions = JSON.parse(fs.readFileSync(".next/server/server-reference-manifest.json", "utf8")).node;
  const payloads = [];
  page.on("request", request => {
    if (actions[request.headers()["next-action"]]?.exportedName === "saveProfileBanner") payloads.push(request.postDataBuffer()?.length ?? 0);
  });
  for (const path of ["/s/audit-studio", "/g/audit-group", "/auditcoach"]) {
    await page.goto(base + path);
    const edit = page.getByRole("button", { name: "Edit profile banner", exact: true });
    await edit.click();
    const dialog = page.getByRole("dialog", { name: "Profile banner", exact: true });
    await dialog.getByRole("button", { name: "Choose image", exact: true }).waitFor();
    await page.waitForFunction(() => ![...document.querySelectorAll('.profile-banner-controls button')].find(el => el.textContent === "Choose image")?.disabled);
    await dialog.locator('input[type="file"]').setInputFiles({ name: "large-phone-photo.jpg", mimeType: "image/jpeg", buffer });
    const save = dialog.getByRole("button", { name: "Save banner", exact: true });
    await save.waitFor();
    const preview = await dialog.getByAltText("Banner preview").getAttribute("src");
    assert(preview.length <= 700_000, "Compression includes base64 overhead");
    const metadata = await sharp(Buffer.from(preview.split(",")[1], "base64")).metadata();
    assert(metadata.width <= 1600 && Math.abs(metadata.width / metadata.height - 3.2) < 0.02, "Upload uses the banner crop");
    await save.click();
    await dialog.waitFor({ state: "hidden" });
    await page.reload();
    await page.locator('.profile-banner-image').first().waitFor();
    await edit.click();
    await dialog.getByAltText("Banner preview").waitFor();
    const stored = await dialog.getByAltText("Banner preview").getAttribute("src");
    assert(stored?.startsWith("data:image/jpeg;base64,"), "Banner persists in isolated storage");
    await dialog.getByRole("button", { name: "Remove image", exact: true }).click();
    await save.click();
    await dialog.waitFor({ state: "hidden" });
    await page.reload();
    assert.equal(await page.locator('.profile-banner-image').count(), 0, "Banner removal persists");
    console.log(`PASS ${browserName} ${path}: large photo compressed, saved, reloaded, and removed (${preview.length} characters)`);
  }
  assert(payloads.length === 6 && payloads.every(bytes => bytes > 0 && bytes < 710_000), "Every save stays below the request budget");
  console.log(`PASS original ${buffer.length} bytes; largest request ${Math.max(...payloads)} bytes`);
  await context.close();
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  fs.closeSync(log);
}
