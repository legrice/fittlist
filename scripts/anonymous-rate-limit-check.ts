import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import {
  takeAnonymousActionRateLimit,
  type AnonymousActionRateLimits,
} from "../src/lib/anonymous-rate-limit";
import { inquiryMessageAuthorUserId } from "../src/lib/inquiry";

const hour = 60 * 60 * 1000;
const coachId = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-08-27T15:00:00.000Z");
// This check exercises an isolated in-memory database. Keep its HMAC output
// deterministic and independent of whatever secret a deployment uses.
process.env.SESSION_SECRET = "anonymous-rate-limit-check-only-secret";
const limits: AnonymousActionRateLimits = {
  ip: { max: 2, windowMs: hour },
  ipTarget: { max: 2, windowMs: hour },
  subjectTarget: { max: 1, windowMs: hour },
  target: { max: 5, windowMs: hour },
};

async function main(): Promise<void> {
  assert.equal(
    inquiryMessageAuthorUserId(false, coachId),
    null,
    "an inbound form email must not be inferred to be an account author",
  );
  assert.equal(
    inquiryMessageAuthorUserId(true, coachId),
    coachId,
    "a coach-authored reply must retain its persisted account author",
  );

  const inquiryActions = await readFile(
    new URL("../src/app/actions/inquiries.ts", import.meta.url),
    "utf8",
  );
  const actionSections = [
    ["sendInquiry", "markThreadRead", "inquiry_message"],
    ["replyToInquiry", "replyAsRequester", "inquiry_coach_reply"],
    ["replyAsRequester", "replyByToken", "inquiry_requester_reply"],
    ["replyByToken", null, "inquiry_token_reply"],
  ] as const;
  for (const [name, nextName, limiterAction] of actionSections) {
    const start = inquiryActions.indexOf(`export async function ${name}`);
    const end = nextName
      ? inquiryActions.indexOf(`export async function ${nextName}`, start)
      : inquiryActions.length;
    const section = inquiryActions.slice(start, end);
    const limiter = section.indexOf(`action: "${limiterAction}"`);
    const firstMessageMutation = Math.min(
      ...[".insert(schema.inquiryThreads)", ".insert(schema.inquiryMessages)"]
        .map((needle) => section.indexOf(needle))
        .filter((index) => index >= 0),
    );
    assert.ok(start >= 0 && end > start, `${name} source boundary was not found`);
    assert.ok(limiter >= 0, `${name} is missing its durable limiter`);
    assert.ok(Number.isFinite(firstMessageMutation), `${name} has no inquiry-state mutation to guard`);
    assert.ok(
      limiter < firstMessageMutation,
      `${name} consumes its limiter after writing inquiry state`,
    );
  }

  const reportActions = await readFile(
    new URL("../src/app/actions/content-reports.ts", import.meta.url),
    "utf8",
  );
  assert.equal(
    reportActions.includes("where(eq(schema.users.email, row.requesterEmail))"),
    false,
    "inbound report attribution again inferred an account from requesterEmail",
  );
  assert.ok(
    reportActions.includes("const authorUserId = inquiryMessageAuthorUserId(row.fromCoach, row.coachUserId)"),
    "inquiry report snapshots are not using the non-inference invariant",
  );

  const client = new PGlite();
  // A pre-fix report could have guessed that an inbound form message belonged
  // to an account merely because its typed email matched. 0111 must clear that
  // unsafe historical attribution as well as protecting new reports. These
  // minimal predecessor tables keep the test independent of whether metadata
  // has already journaled 0111; the migration itself is always applied once.
  const threadId = "22222222-2222-4222-8222-222222222222";
  const inboundId = "33333333-3333-4333-8333-333333333333";
  const outboundId = "33333333-3333-4333-8333-333333333334";
  const legacyReportId = "44444444-4444-4444-8444-444444444444";
  const coachReportId = "44444444-4444-4444-8444-444444444445";
  const unrelatedAccountId = "55555555-5555-4555-8555-555555555555";
  await client.exec(`
    CREATE TABLE "inquiry_threads" (
      "id" uuid PRIMARY KEY NOT NULL,
      "coach_user_id" uuid NOT NULL
    );
    CREATE TABLE "inquiry_messages" (
      "id" uuid PRIMARY KEY NOT NULL,
      "thread_id" uuid NOT NULL,
      "from_coach" boolean NOT NULL
    );
    CREATE TABLE "content_reports" (
      "id" uuid PRIMARY KEY NOT NULL,
      "content_type" text NOT NULL,
      "content_id" uuid NOT NULL,
      "author_user_id" uuid
    );
    INSERT INTO "inquiry_threads" ("id", "coach_user_id")
      VALUES ('${threadId}', '${coachId}');
    INSERT INTO "inquiry_messages" ("id", "thread_id", "from_coach")
      VALUES
        ('${inboundId}', '${threadId}', false),
        ('${outboundId}', '${threadId}', true);
    INSERT INTO "content_reports" ("id", "content_type", "content_id", "author_user_id")
      VALUES
        ('${legacyReportId}', 'inquiry_message', '${inboundId}', '${unrelatedAccountId}'),
        ('${coachReportId}', 'inquiry_message', '${outboundId}', '${coachId}');
  `);

  const migration = await readFile(
    new URL("../drizzle/0111_inquiry_rate_limits.sql", import.meta.url),
    "utf8",
  );
  await client.exec(migration.replaceAll("--> statement-breakpoint", ""));
  const db = drizzle(client, { schema });
  const [backfilledReport] = await db
    .select({ authorUserId: schema.contentReports.authorUserId })
    .from(schema.contentReports)
    .where(eq(schema.contentReports.id, legacyReportId));
  assert.equal(
    backfilledReport?.authorUserId,
    null,
    "0111 retained an inferred account author on an inbound inquiry report",
  );
  const [backfilledCoachReport] = await db
    .select({ authorUserId: schema.contentReports.authorUserId })
    .from(schema.contentReports)
    .where(eq(schema.contentReports.id, coachReportId));
  assert.equal(
    backfilledCoachReport?.authorUserId,
    coachId,
    "0111 cleared a coach author that was verified by the persisted message direction",
  );

  const base = {
    action: "inquiry_message",
    target: { kind: "coach", id: coachId },
    subject: "Visitor@Example.com",
    ip: "203.0.113.10",
    limits,
    now,
  } as const;

  assert.equal(await takeAnonymousActionRateLimit(db, base), true, "first message should be allowed");
  assert.equal(
    await takeAnonymousActionRateLimit(db, base),
    false,
    "the same email+coach should stop at its configured limit",
  );

  let rows = await db.select().from(schema.anonymousActionRateLimits);
  assert.equal(rows.length, 4, "one accepted action should create all four dimensions");
  assert.ok(
    rows.every((row) => row.hitCount === 1),
    "a rejected multi-scope action must roll back earlier counter increments",
  );
  const persisted = JSON.stringify(rows);
  for (const raw of ["visitor@example.com", "203.0.113.10", coachId]) {
    assert.equal(persisted.toLowerCase().includes(raw), false, `rate-limit rows leaked ${raw}`);
  }
  assert.ok(rows.every((row) => /^[a-f0-9]{64}$/.test(row.keyHash)), "keys must be HMAC digests");

  assert.equal(
    await takeAnonymousActionRateLimit(db, { ...base, subject: "other@example.com" }),
    true,
    "a second subject should use the remaining IP and IP+target slot",
  );
  assert.equal(
    await takeAnonymousActionRateLimit(db, { ...base, subject: "third@example.com" }),
    false,
    "the shared IP and IP+target windows should cap rotating subjects",
  );
  rows = await db.select().from(schema.anonymousActionRateLimits);
  assert.equal(rows.length, 5, "a rejection must not leave a new subject counter behind");
  const targetRow = rows.find((row) => row.scope === "target");
  assert.equal(targetRow?.hitCount, 2, "a rejection must not consume the aggregate target counter");

  assert.equal(
    await takeAnonymousActionRateLimit(db, {
      ...base,
      now: new Date(now.getTime() + hour + 1),
    }),
    true,
    "an elapsed first-hit window should reset atomically",
  );
  const [resetSubject] = await db
    .select()
    .from(schema.anonymousActionRateLimits)
    .where(eq(schema.anonymousActionRateLimits.scope, "subject_target"));
  assert.equal(resetSubject?.hitCount, 1, "the elapsed subject window did not reset to one");

  const concurrentLimits: AnonymousActionRateLimits = {
    ip: { max: 100, windowMs: hour },
    ipTarget: { max: 100, windowMs: hour },
    subjectTarget: { max: 100, windowMs: hour },
    target: { max: 3, windowMs: hour },
  };
  const attempts = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      takeAnonymousActionRateLimit(db, {
        action: "concurrent_check",
        target: { kind: "coach", id: "66666666-6666-4666-8666-666666666666" },
        subject: `person-${index}@example.com`,
        ip: `198.51.100.${index + 1}`,
        limits: concurrentLimits,
        now,
      }),
    ),
  );
  assert.equal(
    attempts.filter(Boolean).length,
    3,
    "concurrent requests bypassed the final aggregate-target slot",
  );

  await db.insert(schema.anonymousActionRateLimits).values({
    action: "expired_check",
    targetKind: "coach",
    scope: "ip",
    keyHash: "a".repeat(64),
    windowStartedAt: new Date(now.getTime() - 3 * hour),
    expiresAt: new Date(now.getTime() - 1),
  });
  await takeAnonymousActionRateLimit(db, {
    action: "cleanup_trigger",
    target: { kind: "coach", id: coachId },
    ip: "192.0.2.1",
    limits: { ip: { max: 1, windowMs: hour } },
    now,
  });
  const expired = await db
    .select()
    .from(schema.anonymousActionRateLimits)
    .where(eq(schema.anonymousActionRateLimits.action, "expired_check"));
  assert.equal(expired.length, 0, "bounded opportunistic cleanup left an expired row behind");

  await client.close();
  console.log("ANONYMOUS RATE-LIMIT CHECKS PASSED");
}

void main();
