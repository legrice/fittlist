import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const files = await Promise.all([
  "../src/app/actions/subscribe.ts",
  "../src/app/actions/unsubscribe.ts",
  "../src/app/follow/confirm/route.ts",
  "../src/app/follow/continue/page.tsx",
  "../src/app/api/unsub/[token]/route.ts",
  "../src/app/api/unsub/digest/[token]/route.ts",
  "../src/app/u/[token]/page.tsx",
  "../src/app/u/digest/[token]/page.tsx",
  "../src/lib/email-follow.ts",
  "../drizzle/0112_email_follow_confirmation.sql",
].map((path) => readFile(new URL(path, import.meta.url), "utf8")));

const [
  subscribeActions,
  unsubscribeActions,
  confirmationGet,
  confirmationPage,
  subscriberApi,
  digestApi,
  subscriberPage,
  digestPage,
  emailFollow,
  migration,
] = files;

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0, `missing marker: ${startMarker}`);
  assert(end > start, `missing marker after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

// The public request may create and deliver a pending confirmation, but it is
// forbidden from touching the relationship or announcing it as a follow.
const requestAction = between(
  subscribeActions,
  "export async function subscribe(",
  "type EmailFollowActivation",
);
assert.match(requestAction, /takeAnonymousActionRateLimit/);
assert.match(requestAction, /action: "email_follow_request"/);
assert.match(requestAction, /action: "email_follow_mailbox"/);
assert.match(requestAction, /target: \{ kind: "mailbox", id: "global" \}/);
assert.match(subscribeActions, /EMAIL_FOLLOW_MAILBOX_LIMITS[\s\S]*subjectTarget: \{ max: 5,/);
assert.match(requestAction, /insert\(schema\.emailFollowConfirmations\)/);
assert.match(requestAction, /tokenHash: emailFollowTokenHash\(token\)/);
assert.match(requestAction, /sendFollowConfirmation\(trainer, email, token\)/);
assert.match(requestAction, /Check your email to confirm the follow\./);
assert.doesNotMatch(requestAction, /schema\.subscribers/);
assert.doesNotMatch(requestAction, /schema\.users\.email/);
assert.doesNotMatch(requestAction, /sendWelcome\(/);
assert.doesNotMatch(requestAction, /addNotification\(/);
assert.match(emailFollow, /EMAIL_FOLLOW_TTL_MS = 30 \* 60 \* 1000/);
assert.match(emailFollow, /createHash\("sha256"\)/);

// Consumption and activation are one serializable transaction. The update's
// unconsumed + unexpired preconditions make the bearer token single-use even
// when two confirmation POSTs race.
const consumeAction = between(
  subscribeActions,
  "async function consumeEmailFollowToken(",
  "/** The email GET only parks its token.",
);
assert.match(consumeAction, /db\.transaction\(/);
assert.match(consumeAction, /isolationLevel: "serializable"/);
assert.match(consumeAction, /isNull\(schema\.emailFollowConfirmations\.consumedAt\)/);
assert.match(consumeAction, /gt\(schema\.emailFollowConfirmations\.expiresAt, now\)/);
assert.match(consumeAction, /tx\s*\.update\(schema\.emailFollowConfirmations\)/);
assert.match(consumeAction, /tx\s*\.insert\(schema\.subscribers\)/);
assert.match(consumeAction, /onConflictDoUpdate\(/);
assert.match(consumeAction, /existing\.optedOutAt >= claimed\.createdAt/);

const confirmAction = between(
  subscribeActions,
  "export async function confirmEmailFollow(",
  "// A session may only opt out",
);
const afterIndex = confirmAction.indexOf("after(async () =>");
assert(afterIndex >= 0, "post-confirmation delivery is not deferred until after commit");
assert(confirmAction.indexOf("sendWelcome(", afterIndex) > afterIndex);
assert(confirmAction.indexOf("addNotification(", afterIndex) > afterIndex);

// The compatibility action ignores the caller's email and derives ownership
// from the signed-in account. Email links use separate audience-bound tokens.
const bareEmailOptOut = between(
  subscribeActions,
  "export async function unsubscribeEmail(",
  "// ---- account-based follows",
);
assert.match(bareEmailOptOut, /getSessionUserId\(\)/);
assert.match(bareEmailOptOut, /schema\.subscribers\.email, me\.email/);
assert.doesNotMatch(bareEmailOptOut, /emailRaw\.trim/);
assert.match(unsubscribeActions, /verifyUnsubToken\(token\)/);
assert.match(unsubscribeActions, /verifyDigestUnsubToken\(token\)/);

// Link scanners may GET every URL in an email. GET only parks/redirects;
// human pages render explicit POST actions and contain no relational updates.
assert.match(confirmationGet, /export function GET/);
assert.match(confirmationGet, /httpOnly: true/);
assert.doesNotMatch(confirmationGet, /schema\.|getDb\(/);
assert.match(confirmationPage, /form action=\{confirmEmailFollow\}/);
for (const [label, route, mutator] of [
  ["subscriber", subscriberApi, "unsubscribe(token)"],
  ["digest", digestApi, "optOut(token)"],
]) {
  const get = route.slice(route.indexOf("export async function GET"));
  assert.doesNotMatch(get, new RegExp(`await ${mutator.replace(/[()]/g, "\\$&")}`), `${label} GET mutates`);
  assert.match(route, /export async function POST/);
}
assert.doesNotMatch(subscriberPage, /\.update\(schema\./);
assert.doesNotMatch(digestPage, /\.update\(schema\./);
assert.match(subscriberPage, /form action=\{confirmSubscriberUnsubscribe\}/);
assert.match(digestPage, /form action=\{confirmDigestUnsubscribe\}/);

// Apply 0112 to a minimal prior schema. This validates the SQL itself, its
// fail-closed legacy backfill, token constraints, and coach cascade without
// relying on Drizzle metadata generation in this check.
const client = new PGlite();
await client.exec(`
  CREATE TABLE "users" ("id" uuid PRIMARY KEY);
  CREATE TABLE "subscribers" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "trainer_user_id" uuid NOT NULL,
    "email" text NOT NULL,
    "user_id" uuid,
    "opted_out_at" timestamp with time zone
  );
  INSERT INTO "users" ("id") VALUES
    ('10000000-0000-4000-8000-000000000001'),
    ('10000000-0000-4000-8000-000000000002');
  INSERT INTO "subscribers" ("trainer_user_id", "email", "user_id", "opted_out_at") VALUES
    ('10000000-0000-4000-8000-000000000001', 'legacy-active@example.com', NULL, NULL),
    ('10000000-0000-4000-8000-000000000001', 'legacy-inactive@example.com', NULL, '2026-01-01T00:00:00Z'),
    ('10000000-0000-4000-8000-000000000001', 'account-active@example.com', '10000000-0000-4000-8000-000000000002', NULL);
`);
await client.exec(migration.replaceAll("--> statement-breakpoint", ""));

const legacy = await client.query(
  `SELECT "email", "opted_out_at" FROM "subscribers" ORDER BY "email"`,
);
const byEmail = new Map(legacy.rows.map((row) => [row.email, row.opted_out_at]));
assert(byEmail.get("legacy-active@example.com"), "unverified legacy follower remained active");
assert.equal(
  new Date(byEmail.get("legacy-inactive@example.com")).toISOString(),
  "2026-01-01T00:00:00.000Z",
  "existing opt-out timestamp changed",
);
assert.equal(byEmail.get("account-active@example.com"), null, "account-backed follower was disabled");

const hash = "a".repeat(64);
await client.query(
  `INSERT INTO "email_follow_confirmations"
    ("trainer_user_id", "email", "token_hash", "expires_at")
   VALUES ('10000000-0000-4000-8000-000000000001', 'new@example.com', $1, now() + interval '30 minutes')`,
  [hash],
);
await assert.rejects(() => client.query(
  `INSERT INTO "email_follow_confirmations"
    ("trainer_user_id", "email", "token_hash", "expires_at")
   VALUES ('10000000-0000-4000-8000-000000000001', 'bad@example.com', $1, now())`,
  ["b".repeat(63)],
));
await assert.rejects(() => client.query(
  `INSERT INTO "email_follow_confirmations"
    ("trainer_user_id", "email", "token_hash", "expires_at")
   VALUES ('10000000-0000-4000-8000-000000000001', 'duplicate@example.com', $1, now())`,
  [hash],
));

const firstClaim = await client.query(
  `UPDATE "email_follow_confirmations"
   SET "consumed_at" = now()
   WHERE "token_hash" = $1 AND "consumed_at" IS NULL AND "expires_at" > now()
   RETURNING "id"`,
  [hash],
);
const secondClaim = await client.query(
  `UPDATE "email_follow_confirmations"
   SET "consumed_at" = now()
   WHERE "token_hash" = $1 AND "consumed_at" IS NULL AND "expires_at" > now()
   RETURNING "id"`,
  [hash],
);
assert.equal(firstClaim.rows.length, 1, "fresh confirmation could not be claimed");
assert.equal(secondClaim.rows.length, 0, "confirmation token was not single-use");

await client.query(`DELETE FROM "users" WHERE "id" = '10000000-0000-4000-8000-000000000001'`);
const afterCoachDelete = await client.query(`SELECT count(*)::int AS "count" FROM "email_follow_confirmations"`);
assert.equal(afterCoachDelete.rows[0].count, 0, "coach deletion left confirmation tokens behind");
await client.close();

console.log("EMAIL FOLLOW CONFIRMATION CHECKS PASSED");
