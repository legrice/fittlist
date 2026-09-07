import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import webpush from "web-push";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { listNotifications, markNotificationsRead, unreadHeaderCounts } from "../src/lib/notify";
import { sendMessage } from "../src/lib/mailer";
import { sessionSecretRaw } from "../src/lib/secret";
import { oauthStateMatches } from "../src/lib/oauth-state";
import { digestUnsubTokenFor, unsubTokenFor, verifyDigestUnsubToken, verifyUnsubToken, sendWeeklyDigestForTrainer, sendMergedDigestForFan } from "../src/lib/notifier";
import { dowOfDate, todayIso } from "../src/lib/format";
import { sendDailyAdminStats } from "../src/lib/adminstats";
import { pushSignupPing, pushToAdmins, pushToUser } from "../src/lib/push";

async function main() {
// Ordered audit stages run separately. All data stays in an in-memory database;
// outbound fetch is rejected unless a test installs its own transport stub.
const stage = process.argv[2];
assert(["notifications", "security", "recovery"].includes(stage), "Choose notifications, security, or recovery");
const originalFetch = globalThis.fetch;
const savedEnv = { ...process.env };
const originalDb = globalThis.__fittlistDb;
globalThis.fetch = async () => { throw new Error("Unexpected network request in isolated operations audit"); };
for (const key of ["DATABASE_URL", "RESEND_API_KEY", "BLOB_READ_WRITE_TOKEN", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "CRON_SECRET"]) delete process.env[key];
process.env.SESSION_SECRET = randomBytes(40).toString("hex");
const client = new PGlite();
const db = drizzle(client, { schema });
globalThis.__fittlistDb = Promise.resolve(db);
const checks: string[] = [];
const pass = (label: string) => { checks.push(label); };

async function notifications() {
  const [viewer, other] = await db.insert(schema.users).values([
    { email: "audit-viewer@example.test", name: "Viewer" },
    { email: "audit-other@example.test", name: "Other" },
  ]).returning();
  const timestamp = new Date("2026-09-07T12:00:00.123Z");
  await db.insert(schema.notifications).values(Array.from({ length: 55 }, (_, index) => ({
    userId: viewer.id, type: "follow", title: `Update ${index}`, createdAt: timestamp,
  })));
  const [message, feedback, foreign] = await db.insert(schema.notifications).values([
    { userId: viewer.id, type: "message", title: "Message" },
    { userId: viewer.id, type: "feedback", title: "Feedback" },
    { userId: other.id, type: "follow", title: "Other viewer's update" },
  ]).returning();
  // A timestamp finer than JS Date's precision previously caused lost pages.
  await client.query("insert into notifications (user_id, type, title, created_at) values ($1, 'follow', 'Microseconds', '2026-09-07T12:00:00.123999Z')", [viewer.id]);
  assert.equal((await unreadHeaderCounts(viewer.id, viewer.email)).notifications, 56);
  const first = await listNotifications(viewer.id, 50, ["message", "feedback"]);
  assert.equal(first.length, 50);
  assert.equal(first[0].title, "Microseconds");
  assert.equal((await unreadHeaderCounts(viewer.id, viewer.email)).notifications, 56, "Loading must be read-only");
  pass("Read-only notification loading; message/feedback exclusion and viewer isolation");

  await markNotificationsRead(viewer.id, []);
  assert.equal((await unreadHeaderCounts(viewer.id, viewer.email)).notifications, 56, "Failed/empty display must not clear unseen rows");
  await markNotificationsRead(viewer.id, first.map((row) => row.id));
  assert.equal((await unreadHeaderCounts(viewer.id, viewer.email)).notifications, 6);
  const [firstRead] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, first[0].id));
  await markNotificationsRead(viewer.id, first.map((row) => row.id));
  const [secondRead] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, first[0].id));
  assert.equal(firstRead.readAt?.getTime(), secondRead.readAt?.getTime(), "Cached/repeated acknowledgement must be idempotent");
  pass("Only displayed rows acknowledged; repeat/cached acknowledgement is idempotent");

  const [newer] = await db.insert(schema.notifications).values({ userId: viewer.id, type: "follow", title: "Arrived while viewing" }).returning();
  const last = first.at(-1)!;
  const second = await listNotifications(viewer.id, 50, ["message", "feedback"], { id: last.id, createdAt: last.createdAtCursor });
  assert.equal(second.length, 6);
  assert.equal(new Set([...first, ...second].map((row) => row.id)).size, 56, "Pagination must not duplicate or skip timestamp ties");
  assert(!second.some((row) => row.id === newer.id), "New arrivals must not shift older paging");
  await markNotificationsRead(viewer.id, second.map((row) => row.id));
  assert.equal((await unreadHeaderCounts(viewer.id, viewer.email)).notifications, 1);
  await markNotificationsRead(viewer.id, [foreign.id, message.id, feedback.id, "malformed", ""]);
  for (const id of [foreign.id, message.id, feedback.id, newer.id]) {
    const [row] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, id));
    assert.equal(row.readAt, null, `Unauthorized or unseen notification acknowledged: ${id}`);
  }
  // Put the microsecond boundary itself at the cursor to test precision directly.
  const afterMicro = await listNotifications(viewer.id, 60, ["message", "feedback"], {
    id: first[0].id, createdAt: first[0].createdAtCursor,
  });
  assert.equal(afterMicro.length, 55);
  pass("Stable 50-row cursor paging across equal/microsecond dates and concurrent arrivals");
  pass("Foreign IDs, hidden types, and malformed IDs cannot clear notifications");

  const outbound = { to: viewer.email, subject: "Audit", text: "Synthetic private bearer URL", kind: "magic_link" as const };
  Object.assign(process.env, { NODE_ENV: "production" });
  const originalError = console.error;
  console.error = () => undefined;
  try {
    assert.deepEqual(await sendMessage(outbound), { ok: false, status: "error:not_configured" });
    process.env.RESEND_API_KEY = "synthetic-audit-token";
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    assert.deepEqual(await sendMessage(outbound), { ok: false, status: "error:503" });
    globalThis.fetch = async () => { throw new TypeError("simulated network loss"); };
    assert.deepEqual(await sendMessage(outbound), { ok: false, status: "error" });
    globalThis.fetch = async () => new Response("{}", { status: 200 });
    assert.deepEqual(await sendMessage(outbound), { ok: true, status: "sent" });
    const logs = await db.select().from(schema.messageLog);
    assert.equal(logs.length, 4);
    assert(logs.every((row) => row.body === "[content omitted]"), "Mail logs must not retain bearer links/content");
    pass("Missing email provider, HTTP rejection, network loss, and success report actual delivery state; logs omit content");
  } finally { console.error = originalError; }

  await db.update(schema.users).set({ handle: "audit-teacher" }).where(eq(schema.users.id, other.id));
  const today = todayIso();
  await db.insert(schema.classes).values({ userId: other.id, name: "Audit class", dayOfWeek: dowOfDate(today), startTime: "23:59", durationMin: 30, specificDate: today });
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  assert.equal(await sendWeeklyDigestForTrainer(other.id, [{ id: viewer.id, email: viewer.email }]), 0);
  assert.equal(await sendMergedDigestForFan(viewer.id, [other.id]), 0);
  globalThis.fetch = async () => new Response("{}", { status: 200 });
  assert.equal(await sendWeeklyDigestForTrainer(other.id, [{ id: viewer.id, email: viewer.email }]), 1);
  assert.equal(await sendMergedDigestForFan(viewer.id, [other.id]), 1);
  pass("Individual and merged weekly digest counts include only successful email deliveries");

  process.env.ADMIN_EMAILS = viewer.email;
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  assert.deepEqual(await sendDailyAdminStats(), { sent: 0 });
  globalThis.fetch = async () => new Response("{}", { status: 200 });
  assert.deepEqual(await sendDailyAdminStats(), { sent: 1 });
  pass("Daily admin statistics count successful deliveries rather than send attempts");

  const [subscriber] = await db.insert(schema.subscribers).values({ trainerUserId: other.id, email: viewer.email, userId: viewer.id }).returning();
  const token = await unsubTokenFor(subscriber.id);
  const digestToken = await digestUnsubTokenFor(viewer.id);
  assert.equal(await verifyUnsubToken(token), subscriber.id);
  assert.equal(await verifyDigestUnsubToken(digestToken), viewer.id);
  assert.equal(await verifyUnsubToken(digestToken), null);
  assert.equal(await verifyDigestUnsubToken(token), null);
  const unsub = await import("../src/app/api/unsub/[token]/route");
  const digest = await import("../src/app/api/unsub/digest/[token]/route");
  await unsub.GET(new Request("https://audit.example.test/link"), { params: Promise.resolve({ token }) });
  await digest.GET(new Request("https://audit.example.test/link"), { params: Promise.resolve({ token: digestToken }) });
  assert.equal((await db.select().from(schema.subscribers).where(eq(schema.subscribers.id, subscriber.id)))[0].optedOutAt, null);
  assert.equal((await db.select().from(schema.users).where(eq(schema.users.id, viewer.id)))[0].digestOptOutAt, null);
  assert.equal((await unsub.POST(new Request("https://audit.example.test/link", { method: "POST" }), { params: Promise.resolve({ token }) })).status, 200);
  assert.equal((await unsub.POST(new Request("https://audit.example.test/link", { method: "POST" }), { params: Promise.resolve({ token }) })).status, 200);
  assert.equal((await digest.POST(new Request("https://audit.example.test/link", { method: "POST" }), { params: Promise.resolve({ token: digestToken }) })).status, 200);
  assert.equal((await db.select().from(schema.subscribers)).length, 1, "Unsubscribe must not delete following");
  pass("Unsubscribe audience isolation, scanner-safe GET, idempotent POST, and preserved following");
}

async function security() {
  Object.assign(process.env, { NODE_ENV: "production" });
  delete process.env.ALLOW_INSECURE_DEV_SECRET;
  delete process.env.SESSION_SECRET;
  assert.throws(sessionSecretRaw, /SESSION_SECRET is not set/);
  for (const secret of ["change-me", "short", ` ${"a".repeat(40)}`]) {
    process.env.SESSION_SECRET = secret;
    assert.throws(sessionSecretRaw, /SESSION_SECRET/);
  }
  process.env.SESSION_SECRET = randomBytes(40).toString("hex");
  assert(sessionSecretRaw());
  assert.equal(oauthStateMatches(undefined, "anything"), false);
  assert.equal(oauthStateMatches("expected", "wrong"), false);
  assert.equal(oauthStateMatches("expected", "expectee"), false);
  assert.equal(oauthStateMatches("expected", "expected"), true);
  pass("Production refuses missing/weak signing secrets; OAuth state rejects missing or mismatched values");

  for (const route of [
    await import("../src/app/api/cron/daily/route"),
    await import("../src/app/api/cron/weekly/route"),
    await import("../src/app/api/cron/shifts/route"),
  ]) {
    delete process.env.CRON_SECRET;
    assert.equal((await route.GET(new Request("https://audit.example.test/api/cron/job"))).status, 503);
    process.env.CRON_SECRET = "synthetic-secret";
    assert.equal((await route.GET(new Request("https://audit.example.test/api/cron/job"))).status, 401);
    assert.equal((await route.POST(new Request("https://audit.example.test/api/cron/job", { method: "POST", headers: { authorization: "Bearer wrong" } }))).status, 401);
  }
  pass("Every scheduled endpoint rejects absent configuration and unauthorized GET/POST without executing jobs");

  const [recipient] = await db.insert(schema.users).values({ email: "sensitive-recipient@example.test", name: "Push recipient" }).returning();
  process.env.ADMIN_EMAILS = recipient.email;
  const keys = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  process.env.MAIL_REPLY_TO = "audit@example.test";
  await db.insert(schema.pushSubscriptions).values({
    userId: recipient.id, endpoint: "https://example.test/sensitive-endpoint", p256dh: "synthetic", auth: "synthetic",
  });
  const originalSend = webpush.sendNotification;
  const originalDetails = webpush.setVapidDetails;
  const originalError = console.error;
  const captured: unknown[][] = [];
  console.error = (...args) => { captured.push(args); };
  const sensitiveError = Object.assign(new Error("sensitive-exception"), {
    statusCode: 503, endpoint: "https://example.test/sensitive-endpoint",
    headers: { authorization: "sensitive-token" }, body: "sensitive-message",
  });
  const payload = { title: "Audit", body: "Synthetic payload", url: "/calendar" };
  try {
    webpush.sendNotification = async () => { throw sensitiveError; };
    await pushToUser(recipient.id, payload);
    await pushToAdmins(payload);
    webpush.sendNotification = async () => { throw { ...sensitiveError, statusCode: "sensitive-status" }; };
    await pushToUser(recipient.id, payload);
    webpush.sendNotification = async () => { throw null; };
    await pushToUser(recipient.id, payload);
    webpush.setVapidDetails = () => { throw new Error("sensitive-configuration"); };
    await pushSignupPing(recipient.email);
    webpush.setVapidDetails = originalDetails;
    webpush.sendNotification = async () => { throw { statusCode: 410, endpoint: "sensitive-endpoint" }; };
    await pushToUser(recipient.id, payload);
    assert.equal((await db.select().from(schema.pushSubscriptions)).length, 0, "Dead endpoints must still be pruned");

    process.env.RESEND_API_KEY = "synthetic-audit-token";
    globalThis.fetch = async () => { throw sensitiveError; };
    assert.equal((await sendMessage({ to: recipient.email, kind: "adminstats", subject: "Audit", text: "Synthetic" })).ok, false);
    assert.deepEqual(captured, [
      ["push failed", { statusCode: 503 }],
      ["push failed", { statusCode: 503 }],
      ["push failed", { statusCode: null }],
      ["push failed", { statusCode: null }],
      ["signup ping failed", { statusCode: null }],
      ["sendMessage failed"],
    ], "Delivery logs must contain only allowlisted status metadata, never recipients or provider errors");
    pass("Push and mail failure logs omit recipients, bearer endpoints, headers, bodies, and raw errors; dead push endpoints are still pruned");
  } finally {
    webpush.sendNotification = originalSend;
    webpush.setVapidDetails = originalDetails;
    console.error = originalError;
  }
}

async function recovery() {
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: unknown[] };
  const countMigrations = async (target: PGlite) => (await target.query<{ n: number }>('select count(*)::int as n from drizzle.__drizzle_migrations')).rows[0].n;
  assert.equal(await countMigrations(client), journal.entries.length);
  await migrate(db, { migrationsFolder: "./drizzle" });
  assert.equal(await countMigrations(client), journal.entries.length);
  pass(`All ${journal.entries.length} migrations apply to a clean database; rerunning is idempotent`);
  const [owner] = await db.insert(schema.users).values({ email: "restore-owner@example.test", name: "Before backup" }).returning();
  const [item] = await db.insert(schema.classes).values({ userId: owner.id, name: "Recovery class", dayOfWeek: 0, startTime: "08:00", durationMin: 50 }).returning();
  await db.insert(schema.attendances).values({ userId: owner.id, classId: item.id, occurrenceDate: "2026-09-07" });
  const backup = await client.dumpDataDir();
  assert(backup.size > 0);
  await db.update(schema.users).set({ name: "After backup" }).where(eq(schema.users.id, owner.id));
  const restored = new PGlite({ loadDataDir: backup });
  try {
    const restoredDb = drizzle(restored, { schema });
    assert.equal((await restoredDb.select().from(schema.users))[0].name, "Before backup");
    assert.equal((await restoredDb.select().from(schema.classes))[0].id, item.id);
    assert.equal((await restoredDb.select().from(schema.attendances)).length, 1);
    assert.equal(await countMigrations(restored), journal.entries.length);
    await migrate(restoredDb, { migrationsFolder: "./drizzle" });
    assert.equal(await countMigrations(restored), journal.entries.length);
    pass("Isolated PGlite snapshot restores accounts, class relations, saves, and migration history");
    await assert.rejects(restoredDb.transaction(async (tx) => {
      await tx.update(schema.users).set({ name: "Should roll back" }).where(eq(schema.users.id, owner.id));
      throw new Error("simulated deployment transaction failure");
    }), /simulated deployment/);
    assert.equal((await restoredDb.select().from(schema.users))[0].name, "Before backup");
    pass("Failed isolated transaction rolls back without partial account changes");
  } finally { await restored.close(); }

  const { Pool } = await import("pg");
  const descriptors = new Map(["query", "connect", "end"].map((name) => [name, Object.getOwnPropertyDescriptor(Pool.prototype, name)]));
  let closedPools = 0;
  Object.defineProperty(Pool.prototype, "query", { configurable: true, value: async () => { throw new Error("simulated database outage"); } });
  Object.defineProperty(Pool.prototype, "connect", { configurable: true, value: async () => { throw new Error("simulated database outage"); } });
  Object.defineProperty(Pool.prototype, "end", { configurable: true, value: async () => { closedPools++; } });
  try {
    process.env.DATABASE_URL = "postgres://audit:synthetic@127.0.0.1:1/audit";
    const { getDb } = await import("../src/db/index");
    globalThis.__fittlistDb = undefined;
    await assert.rejects(getDb(), /simulated database outage/);
    assert.equal(globalThis.__fittlistDb, undefined);
    await assert.rejects(getDb(), /simulated database outage/);
    assert.equal(closedPools, 2, "Every failed initialization must release its Pool before retrying");
    pass("Repeated PostgreSQL initialization failures close each Pool and permit retry (transport mocked)");
  } finally {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(Pool.prototype, name, descriptor);
      else Reflect.deleteProperty(Pool.prototype, name);
    }
    delete process.env.DATABASE_URL;
    globalThis.__fittlistDb = Promise.resolve(db);
  }
}

try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  if (stage === "notifications") await notifications();
  if (stage === "security") await security();
  if (stage === "recovery") await recovery();
  console.log(JSON.stringify({ stage, passed: checks, limitations: stage === "recovery" ? ["Local PGlite only; Neon/PostgreSQL point-in-time restore, Vercel rollback, production configuration and provider retention are unverified"] : stage === "notifications" ? ["Email transport stubbed; no actual email, push, or native calendar delivery"] : ["Isolated source contracts; deployment provider controls are unverified"] }, null, 2));
} finally {
  await client.close();
  globalThis.fetch = originalFetch;
  globalThis.__fittlistDb = originalDb;
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
}
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
