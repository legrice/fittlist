import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";

// HTTP/server audit, not a browser paint or interaction benchmark. Always uses
// disposable fixtures and a production build; never accepts production data.
const fixturePath = execFileSync(process.execPath, ["--import", "tsx", "scripts/audit-fixtures.ts"], {
  env: { ...process.env, DATABASE_URL: "" }, encoding: "utf8",
}).trim().split("\n").at(-1);
const f = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const db = new PGlite(f.dataDir);
try {
  const { rows: [thread] } = await db.query(
    "insert into inquiry_threads (coach_user_id, requester_email, requester_name) values ($1, 'audit-member@example.test', 'Audit Member') returning id", [f.owner.id],
  );
  await db.query(`insert into inquiry_messages (thread_id, body, created_at)
    select $1, 'HISTORICAL_PREVIEW_SHOULD_NOT_RENDER_' || n, now() - n * interval '1 second'
    from generate_series(1, 2000) n`, [thread.id]);
  await db.query("insert into inquiry_messages (thread_id, body, from_coach) values ($1, 'LATEST_DESKTOP_AUDIT_PREVIEW', true)", [thread.id]);
  // A thumbnail must prevent this legacy original from travelling to the page.
  await db.query("update users set photo = $1, photo_thumb = '/icon.svg' where id = $2", ["LEGACY_ORIGINAL_SHOULD_NOT_RENDER_" + "x".repeat(2_000_000), f.member.id]);
} finally {
  await db.close();
}
const base = "http://localhost:3194";
const log = fs.openSync(`${f.directory}/performance-server.log`, "w");
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3194"], {
  env: { ...process.env, DATABASE_URL: "", PGLITE_DATA_DIR: f.dataDir, SESSION_SECRET: f.secret,
    ALLOW_EMBEDDED_DB_IN_PRODUCTION: "true", ADMIN_EMAILS: f.owner.email, FANS_ENABLED: "true",
    INVITE_ONLY: "false", RESEND_API_KEY: "", BLOB_READ_WRITE_TOKEN: "", NEXT_PUBLIC_ORIGIN: base },
  stdio: ["ignore", log, log],
});
const rows = [];
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    assert.equal(server.exitCode, null, "Audit server must stay running");
    try { if ((await fetch(base)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert(ready, "Audit server starts");
  for (const path of ["/calendar", "/calendar/following", "/discover", "/coachshare", "/inbox", "/notifications", "/settings", "/admin", "/auditcoach", "/s/audit-studio", "/g/audit-group"]) {
    for (let run = 0; run < 3; run++) {
      const start = performance.now();
      const response = await fetch(base + path, { headers: { cookie: `fl_session=${f.owner.token}` }, signal: AbortSignal.timeout(30_000) });
      const headersMs = Math.round(performance.now() - start);
      const body = await response.text();
      assert.equal(response.status, 200, `${path} succeeds`);
      assert(!body.includes('"digest":"'), `${path} has no streamed server error`);
      if (path === "/inbox") {
        assert(body.includes("LATEST_DESKTOP_AUDIT_PREVIEW"), "Latest message remains visible");
        assert(!body.includes("HISTORICAL_PREVIEW_SHOULD_NOT_RENDER"), "History stays outside the inbox payload");
        assert(!body.includes("LEGACY_ORIGINAL_SHOULD_NOT_RENDER"), "Inbox sends thumbnails instead of originals");
      }
      if (path === "/calendar") assert(body.includes("Audit Studio"), "Managed studio remains in the calendar");
      rows.push({ path, run, headersMs, totalMs: Math.round(performance.now() - start), bytes: Buffer.byteLength(body) });
    }
    console.log(JSON.stringify(rows.slice(-3)));
  }
  const output = `${f.directory}/desktop-performance.json`;
  fs.writeFileSync(output, JSON.stringify({ note: "Local production HTTP responses with embedded DB; excludes browser hydration and Discover's client-loaded directory.", rows }, null, 2));
  console.log(`PASS: 11 routes; long conversation and legacy-photo checks. Report: ${output}`);
} finally {
  server.kill();
  fs.closeSync(log);
}
