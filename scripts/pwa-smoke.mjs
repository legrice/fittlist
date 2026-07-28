// Everything a home-screen install needs, checked against the running app.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
//   node scripts/pwa-smoke.mjs
import { chromium, devices } from "playwright";
import { skipSetup } from "./lib/wizard.mjs";
const BASE = "http://localhost:3000";
const fail = (m) => { throw new Error("PWA FAIL: " + m); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const c = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await c.newPage();
p.setDefaultTimeout(15000);

// ---- the manifest itself
const res = await p.request.get(BASE + "/manifest.webmanifest");
if (!res.ok()) fail(`manifest not served: ${res.status()}`);
const m = await res.json();
console.log("manifest:", JSON.stringify({ name: m.name, start_url: m.start_url, display: m.display }));
if (m.display !== "standalone") fail(`display should be standalone, got ${m.display}`);
if (m.start_url !== "/app") fail(`start_url should be the app, got ${m.start_url}`);
if (!m.name || !m.short_name) fail("a manifest needs a name and a short_name");
if (m.theme_color !== m.background_color)
  fail("theme and background differ, so the launch will show a seam");

// Chrome wants a 192 and a 512, and Android crops a maskable one to a circle.
for (const size of ["192x192", "512x512"]) {
  if (!m.icons.some((i) => i.sizes === size && i.purpose === "any"))
    fail(`no ${size} icon`);
  if (!m.icons.some((i) => i.sizes === size && i.purpose === "maskable"))
    fail(`no ${size} maskable icon`);
}
for (const icon of m.icons) {
  const r = await p.request.get(BASE + icon.src);
  if (!r.ok()) fail(`${icon.src} is listed but 404s`);
  const buf = await r.body();
  // PNG header, then width/height big-endian at bytes 16..24.
  if (buf.subarray(1, 4).toString() !== "PNG") fail(`${icon.src} is not a PNG`);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (`${w}x${h}` !== icon.sizes) fail(`${icon.src} says ${icon.sizes} but is ${w}x${h}`);
}
console.log(`manifest ok (${m.icons.length} icons, all present and the right size)`);

// ---- the tags iOS reads instead of the manifest
await p.goto(BASE + "/");
const head = await p.evaluate(() => ({
  manifest: document.querySelector('link[rel="manifest"]')?.getAttribute("href") ?? null,
  apple: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href") ?? null,
  // Next emits the modern name; the prefixed one is there for older iOS.
  capable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute("content") ?? null,
  capableModern: document.querySelector('meta[name="mobile-web-app-capable"]')?.getAttribute("content") ?? null,
  title: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute("content") ?? null,
  theme: document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? null,
}));
console.log("head:", JSON.stringify(head));
if (!head.manifest) fail("no manifest link in the document");
if (!head.apple) fail("no apple-touch-icon, so iOS would screenshot the page instead");
if (head.capable !== "yes") fail("apple-mobile-web-app-capable is not set (older iOS opens in Safari)");
if (head.capableModern !== "yes") fail("mobile-web-app-capable is not set");
if (head.theme !== m.theme_color) fail(`theme-color ${head.theme} fights the manifest ${m.theme_color}`);
const appleIcon = await p.request.get(BASE + head.apple);
if (!appleIcon.ok()) fail("the apple-touch-icon 404s");

// ---- the service worker registers and stays out of the way
await p.waitForFunction(() => navigator.serviceWorker?.controller !== undefined, null, { timeout: 10000 })
  .catch(() => {});
const reg = await p.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration();
  return r ? r.scope : null;
});
if (!reg) fail("the service worker never registered, so Chrome won't offer an install");
console.log("service worker registered at", reg);

const cached = await p.evaluate(async () => {
  const keys = await caches.keys();
  const out = [];
  for (const k of keys) {
    const c = await caches.open(k);
    for (const req of await c.keys()) out.push(new URL(req.url).pathname);
  }
  return out.sort();
});
console.log("cached:", JSON.stringify(cached));
if (!cached.length) fail("the worker cached nothing, so it isn't running");
// The one rule that matters: never a page, never an action, never a session.
const leaky = cached.filter((u) => !/^\/(fonts\/|icon-|apple-touch-icon)/.test(u));
if (leaky.length) fail(`the worker cached things it must not: ${JSON.stringify(leaky)}`);
console.log("the worker caches static assets only ok");

// ---- the install row: an account, then the row it should and should not show
await p.goto(BASE + "/");
await p.getByRole("button", { name: "Sign up with email" }).click();
await p.getByPlaceholder("you@example.com").fill("coach@example.com");
await p.getByPlaceholder("Password").fill("coach-pass-123");
await p.getByRole("button", { name: "Create account" }).click();
await p.getByRole("button", { name: "Not now" }).click().catch(() => {});
await p.getByText("Pick your link.").waitFor();
await p.getByPlaceholder("Your name").fill("Sarah");
await p.getByRole("button", { name: "Claim it" }).click();
await skipSetup(p);
await p.getByRole("heading", { name: "Your week is empty" }).waitFor();

// Desktop Chrome with no install prompt and no iOS: the row stays away rather
// than pointing at a button that isn't there.
await p.locator(".usericon").click();
await p.waitForTimeout(700);
if (await p.getByText("Add to home screen").isVisible().catch(() => false))
  fail("the install row showed on a browser with nothing to install with");
console.log("no install row where there's nothing to install ok");

// An iPhone gets instructions, because iOS has no prompt to fire.
const ios = await b.newContext({ ...devices["iPhone 13"], storageState: await c.storageState() });
const q = await ios.newPage();
q.setDefaultTimeout(15000);
await q.goto(BASE + "/app");
await q.locator(".usericon").click();
await q.waitForTimeout(700);
const row = q.getByText("Add to home screen");
if (!(await row.isVisible())) fail("an iPhone should be told how to install");
await row.click();
await q.getByText(/Add to Home Screen/).waitFor();
console.log("iOS gets the Share sheet instructions ok");
await q.screenshot({ path: (process.env.SMOKE_OUT ?? ".") + "/shot-install.png" });

await b.close();
console.log("PWA CHECKS PASSED");
