// A load pass over the hot pages: seed a small world, then hammer each
// route with concurrent requests and report latency percentiles and errors.
//
//   rm -rf .data/pglite
//   INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
//   node scripts/load-smoke.mjs
//
// Read the local numbers as a ceiling check, not a forecast: dev runs on
// PGlite, an embedded single-connection Postgres, so it serializes queries
// that production (a pooled Postgres) runs in parallel. What this catches is
// the shape of trouble — a route whose latency explodes with concurrency, or
// one that errors under load — not production response times.
import { chromium } from "playwright";
import { fillLocation, skipSetup } from "./lib/wizard.mjs";

const BASE = "http://localhost:3000";
const REQUESTS = Number(process.env.LOAD_N ?? 200);
const CONCURRENCY = Number(process.env.LOAD_C ?? 20);
const fail = (m) => { throw new Error("LOAD FAIL: " + m); };

// ---- seed: one coach with classes, one member following them ----
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(20000);
  await p.goto(BASE + "/");
  await p.getByRole("button", { name: "Sign up with email" }).click();
  await p.getByPlaceholder("you@example.com").fill("coach@example.com");
  await p.getByPlaceholder("Password").fill("coach-pass-123");
  await p.getByRole("button", { name: "Create account" }).click();
  await p.getByRole("button", { name: "Not now" }).click().catch(() => {});
  await p.getByText("Pick your link.").waitFor();
  await p.getByPlaceholder("Your name").fill("Load Coach");
  await p.getByRole("button", { name: "Claim it" }).click();
  await skipSetup(p);
  await p.getByRole("heading", { name: "Your week is empty" }).waitFor();
  await p.getByRole("button", { name: "Add your first class" }).click();
  await p.getByPlaceholder("e.g. Barbell Strength").fill("Load Class");
  for (const d of ["Mo", "Tu", "We", "Th", "Fr"]) {
    await p.getByRole("button", { name: d, exact: true }).click();
  }
  await p.getByRole("button", { name: "Select or start typing a studio" }).click();
  await p.getByRole("heading", { name: "Choose a studio" }).waitFor();
  await p.getByRole("button", { name: "+ New studio" }).click();
  await p.getByPlaceholder("e.g. Palisade Barbell").fill("Load Studio");
  await p.getByPlaceholder("e.g. 501 Palisade Ave, Jersey City").fill("1 Test St, Jersey City");
  await p.getByRole("button", { name: "Add studio" }).click();
  await p.locator(".studio-sel .nm", { hasText: "Load Studio" }).waitFor();
  await p.locator(".publishwrap .btn").click();
  await p.waitForTimeout(800);
  await ctx.close();
}
const memberCtx = await b.newContext({ viewport: { width: 390, height: 844 } });
{
  const p = await memberCtx.newPage();
  p.setDefaultTimeout(20000);
  await p.goto(BASE + "/");
  await p.getByRole("button", { name: "Sign up with email" }).click();
  await p.locator(".roleseg button", { hasText: "here to train" }).click();
  await p.getByPlaceholder("you@example.com").fill("load-mem@example.com");
  await p.getByPlaceholder("Password").fill("pass-word-123");
  await p.getByRole("button", { name: "Create account" }).click();
  await p.getByRole("button", { name: "Not now" }).click().catch(() => {});
  await p.getByText("Pick your link.").waitFor();
  await p.getByPlaceholder("Your name").fill("Load Member");
  await p.getByRole("button", { name: "Claim it" }).click();
  await p.getByRole("heading", { name: "Add a photo." }).waitFor();
  await p.getByRole("button", { name: "Continue" }).click();
  await p.getByRole("heading", { name: "Tell people who you are." }).waitFor();
  await fillLocation(p);
  await p.getByRole("button", { name: "Finish setup" }).click();
  await p.waitForURL("**/home");
  await p.goto(BASE + "/loadcoach");
  await p.locator(".profacts .followpill").waitFor();
  await p.waitForTimeout(300);
  await p.locator(".profacts .followpill").click();
  await p.locator(".profacts .followpill", { hasText: "Following" }).waitFor();
}
const cookies = await memberCtx.cookies(BASE);
const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
await b.close();
console.log(`seeded; ${REQUESTS} requests at concurrency ${CONCURRENCY} per route\n`);

// ---- the hammer ----
const routes = [
  { name: "landing        /", path: "/", auth: false },
  { name: "coach page     /loadcoach", path: "/loadcoach", auth: false },
  { name: "feed           /feed", path: "/feed", auth: true },
  { name: "discover       /discover", path: "/discover", auth: true },
  { name: "your week      /week", path: "/week", auth: true },
  { name: "link preview   /api/og", path: "/api/og", auth: false },
  { name: "calendar feed  /api/cal/loadcoach", path: "/api/cal/loadcoach", auth: false },
];

const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];

async function hammer(route) {
  const headers = route.auth ? { cookie: cookieHeader } : {};
  // warm the route so compilation and caches don't pollute the numbers
  for (let i = 0; i < 3; i++) await fetch(BASE + route.path, { headers });
  const times = [];
  let errors = 0;
  let inFlight = 0;
  let sent = 0;
  await new Promise((resolve) => {
    const pump = () => {
      while (inFlight < CONCURRENCY && sent < REQUESTS) {
        sent++;
        inFlight++;
        const t0 = performance.now();
        fetch(BASE + route.path, { headers, redirect: "manual" })
          .then(async (res) => {
            await res.arrayBuffer();
            if (res.status >= 400) errors++;
            times.push(performance.now() - t0);
          })
          .catch(() => {
            errors++;
            times.push(performance.now() - t0);
          })
          .finally(() => {
            inFlight--;
            if (times.length + (sent - times.length - inFlight) >= REQUESTS && inFlight === 0 && sent >= REQUESTS) resolve();
            else pump();
          });
      }
    };
    pump();
  });
  times.sort((a, b) => a - b);
  return {
    p50: Math.round(pct(times, 0.5)),
    p95: Math.round(pct(times, 0.95)),
    max: Math.round(times[times.length - 1]),
    errors,
  };
}

let bad = false;
console.log("route                              p50      p95      max   errors");
for (const r of routes) {
  const s = await hammer(r);
  const flag = s.errors > 0 || s.p95 > 5000 ? "  <-- LOOK" : "";
  console.log(
    `${r.name.padEnd(30)} ${String(s.p50).padStart(5)}ms ${String(s.p95).padStart(6)}ms ${String(s.max).padStart(6)}ms ${String(s.errors).padStart(6)}${flag}`,
  );
  if (s.errors > 0) bad = true;
}
if (bad) fail("errors under load");
console.log("\nLOAD CHECKS PASSED (local ceiling check; production runs pooled Postgres)");
