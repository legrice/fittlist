import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { apnsBody, safePushPath } from "../src/lib/apns";
import { deviceAllows, queueNativePush, flushNativePush } from "../src/lib/native-push";
import { addNotification } from "../src/lib/notify";
import { recordProductActivity } from "../src/lib/product-activity";

async function main() {
  // Use an isolated in-memory database and a fake transport: never contact Apple.
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  globalThis.__fittlistDb = Promise.resolve(db);
  process.env.APNS_KEY_ID = "test"; process.env.APNS_TEAM_ID = "test"; process.env.APNS_PRIVATE_KEY = "test";
  process.env.ADMIN_EMAILS = "admin@example.test";
  delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
  const [member, admin, other] = await db.insert(schema.users).values([{ email: "member@example.test" }, { email: "admin@example.test" }, { email: "other@example.test" }]).returning();
  const deviceId = randomUUID(), adminDevice = randomUUID();
  await db.insert(schema.nativePushDevices).values([
    { id: deviceId, userId: member.id, token: "a".repeat(64), sessionVersion: member.sessionVersion, expiresAt: new Date(Date.now()+86400000) },
    { id: adminDevice, userId: admin.id, token: "b".repeat(64), sessionVersion: admin.sessionVersion, expiresAt: new Date(Date.now()+86400000), adminActivity: true },
  ]);
  const payload = { title: "New follower", body: "Hello", url: "/notifications" };
  for (const unsafe of ["https://evil.test", "//evil.test", "/\\evil.test", "/\nredirect"]) assert.equal(safePushPath(unsafe), "/notifications");
  assert.equal(safePushPath("/" + "a".repeat(1000)), "/notifications");
  assert.equal(safePushPath("/inbox?thread=123"), "/inbox?thread=123");
  assert(Buffer.byteLength(apnsBody({ ...payload, title: "😀".repeat(500), body: "😀".repeat(1000) }, randomUUID())) < 4096);
  assert.equal(deviceAllows({ follows:false, messages:true, adminActivity:false }, "follows"), false);
  assert.equal(deviceAllows({ follows:true, messages:true, adminActivity:true }, "unknown"), false);
  await addNotification(member.id, { type:"follow", title: "A new follower", actorUserId:other.id });
  await addNotification(member.id, { type:"message", title: "Message", body:"Private message content", href:"/inbox" });
  await addNotification(member.id, { type:"feedback_reply", title:"Reply", href:"/inbox" });
  await recordProductActivity(other.id, "message_sent");
  let rows = await db.select().from(schema.nativePushDeliveries);
  assert.equal(rows.filter(r=>r.userId===member.id).length,3);
  const adminRows=rows.filter(r=>r.userId===admin.id);
  assert.equal(adminRows.length,1); assert.equal(adminRows[0].category,"adminActivity");
  assert(!JSON.stringify(adminRows).includes("Private message content"));
  const sent: string[]=[];
  let result=await flushNativePush(undefined, async token=>{sent.push(token);return {status:200};});
  assert.equal(result.sent,4); assert.equal((await db.select().from(schema.nativePushDeliveries)).length,0);
  // Permission changes are checked again at delivery, including admin demotion.
  await queueNativePush([member.id],payload,"follows");
  await db.update(schema.nativePushDevices).set({follows:false}).where(eq(schema.nativePushDevices.id,deviceId));
  result=await flushNativePush(undefined,async()=>{throw Error("Opted-out device must not send");}); assert.equal(result.retried,0);
  await queueNativePush([admin.id],payload,"adminActivity"); process.env.ADMIN_EMAILS="";
  result=await flushNativePush(undefined,async()=>{throw Error("Demoted admin must not send");}); assert.equal(result.retried,0);
  // A queued notification cannot follow a device into another account.
  await queueNativePush([member.id],payload,"messages");
  await db.update(schema.nativePushDevices).set({userId:other.id}).where(eq(schema.nativePushDevices.id,deviceId));
  result=await flushNativePush(undefined,async()=>{throw Error("Old account must not send");}); assert.equal(result.retried,0);
  await db.update(schema.nativePushDevices).set({userId:member.id}).where(eq(schema.nativePushDevices.id,deviceId));
  await queueNativePush([member.id],payload,"messages");
  await db.update(schema.users).set({sessionVersion:member.sessionVersion+1}).where(eq(schema.users.id,member.id));
  result=await flushNativePush(undefined,async()=>{throw Error("Revoked session must not send");}); assert.equal(result.retried,0);
  await db.update(schema.users).set({sessionVersion:member.sessionVersion}).where(eq(schema.users.id,member.id));
  await queueNativePush([member.id],payload,"messages");
  const failures=await flushNativePush(undefined,async()=>({status:503})); assert.equal(failures.retried,1);
  rows=await db.select().from(schema.nativePushDeliveries); assert.equal(rows[0].attempts,1); assert(rows[0].availableAt>new Date());
  await db.update(schema.nativePushDeliveries).set({availableAt:new Date(0)});
  result=await flushNativePush(undefined,async()=>({status:410,reason:"Unregistered"})); assert.equal(result.sent,0);
  assert.equal((await db.select().from(schema.nativePushDevices).where(eq(schema.nativePushDevices.id,deviceId))).length,0);
  assert.equal((await db.select().from(schema.nativePushDeliveries)).length,0);
  process.env.ADMIN_EMAILS="admin@example.test";
  await queueNativePush([admin.id],payload,"adminActivity");
  await db.delete(schema.users).where(eq(schema.users.id,admin.id));
  assert.equal((await db.select().from(schema.nativePushDevices)).length,0);
  assert.equal((await db.select().from(schema.nativePushDeliveries)).length,0);
  process.env.CRON_SECRET = "test-cron";
  process.env.SCHEDULED_EMAILS_ENABLED = "false";
  for (const route of [await import("../src/app/api/cron/weekly/route"), await import("../src/app/api/cron/daily/route"), await import("../src/app/api/cron/shifts/route")]) {
    assert.equal((await route.GET(new Request("https://example.test/api/cron", { headers: { authorization: "Bearer test-cron" } }))).status, 204, "Push scheduler activation must not enable email schedules");
  }
  await client.close();
  console.log("PASS native push: migration, routing, privacy, preferences, account switching, revocation, retries, token cleanup, deletion");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
