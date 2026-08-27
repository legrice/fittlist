import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { googleEventIdForClass } from "../src/lib/gcal";

async function main() {
  const actions = await readFile(new URL("../src/app/actions/classes.ts", import.meta.url), "utf8");
  const saveStart = actions.indexOf("const committed = await scheduleTransaction");
  const saveEnd = actions.indexOf("if (!committed.ok) return committed", saveStart);
  assert(saveStart >= 0 && saveEnd > saveStart, "class save must have a transaction boundary");
  const saveTransaction = actions.slice(saveStart, saveEnd);
  for (const [label, operation] of [
    ["attendance delete", /tx\s*\.delete\(schema\.attendances\)/],
    ["class delete", /tx\s*\.delete\(schema\.classes\)/],
    ["template upsert", /tx\s*\.insert\(schema\.classTemplates\)/],
    ["class insert", /tx\s*\.insert\(schema\.classes\)/],
    ["attendance restore", /tx\s*\.insert\(schema\.attendances\)/],
    ["studio catalog upsert", /tx\s*\.insert\(schema\.studioClasses\)/],
  ] as const) {
    assert(operation.test(saveTransaction), `class save transaction is missing ${label}`);
  }
  assert(!/await db\.(?:insert|update|delete)/.test(saveTransaction), "class save leaked a mutation outside its transaction client");

  const deleteStart = actions.indexOf("const outcome = await scheduleTransaction");
  const deleteEnd = actions.indexOf("if (!outcome.ok) return outcome", deleteStart);
  assert(deleteStart >= 0 && deleteEnd > deleteStart, "class delete must have a transaction boundary");
  const deleteTransaction = actions.slice(deleteStart, deleteEnd);
  assert(/tx\s*\.delete\(schema\.attendances\)/.test(deleteTransaction), "class delete must clear attendance transactionally");
  assert(/tx\s*\.delete\(schema\.classes\)/.test(deleteTransaction), "class delete must remove classes transactionally");
  assert(!deleteTransaction.includes("notifyCancelled("), "cancellation email must not run before commit");
  assert(!deleteTransaction.includes("syncGoogleAfter("), "Google sync must not run before commit");

  const google = await readFile(new URL("../src/lib/gcal.ts", import.meta.url), "utf8");
  const syncStart = google.indexOf("export async function syncUserToGoogle");
  const upsert = google.indexOf("await upsertGoogleEvent", syncStart);
  const fingerprintGuard = google.indexOf("scheduleFingerprint(currentRows)", upsert);
  const cleanup = google.indexOf("await deleteGoogleEvent", fingerprintGuard);
  assert(syncStart >= 0 && upsert > syncStart, "Google sync must upsert desired events");
  assert(fingerprintGuard > upsert, "Google sync must detect a stale schedule before cleanup");
  assert(cleanup > fingerprintGuard, "Google sync must delete obsolete events only after complete upserts");

  const base = { seriesId: "24f5efc6-3f57-46e0-aad9-a583db006c34", dayOfWeek: 1, specificDate: null };
  const stable = googleEventIdForClass(base);
  assert.equal(stable, googleEventIdForClass({ ...base }), "Google event id must be deterministic");
  assert.notEqual(stable, googleEventIdForClass({ ...base, dayOfWeek: 2 }), "weekly days need distinct Google ids");
  assert.notEqual(stable, googleEventIdForClass({ ...base, specificDate: "2026-09-01" }), "one-offs need distinct Google ids");
  assert.match(stable, /^[0-9a-v]{5,1024}$/, "Google event id must use Google's allowed alphabet");

  const client = new PGlite();
  const db = drizzle(client);
  const result = await db.transaction(
    async (tx) => tx.execute<{ value: number }>(sql`select 1 as value`),
    { isolationLevel: "serializable" },
  );
  assert.equal(result.rows[0]?.value, 1, "PGlite must support the production transaction isolation setting");
  await client.close();

  console.log("class transaction boundaries and deterministic Google ids ok");
}

void main();
