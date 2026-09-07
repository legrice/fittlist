import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { and, eq, sql } from "drizzle-orm";

// Real migrations, session verification and server actions against a fresh,
// disposable database. Only Next request plumbing and deferred external
// integrations are substituted. This never reads .env or sends email/push.
async function main() {
  if (process.env.DATABASE_URL) throw new Error("Audit refuses DATABASE_URL");
  if (process.env.VERCEL) throw new Error("Audit is local only");
  const stage = Number(process.argv[2] || 0);
  if (stage && ![2, 3, 4, 5].includes(stage)) throw new Error("Choose stage 2, 3, 4 or 5");
  process.env.PGLITE_DATA_DIR = join(mkdtempSync(join(tmpdir(), "fittlist-integrity-")), "db");
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.ADMIN_EMAILS = "";
  const request = new AsyncLocalStorage<string | null>();
  const require = createRequire(import.meta.url);
  // Next aliases this build-time sentinel; plain Node has no bundler alias.
  const moduleRuntime = require("node:module");
  const originalLoad = moduleRuntime._load.bind(moduleRuntime);
  moduleRuntime._load = (specifier: string, ...args: unknown[]) => specifier === "server-only" ? {} : originalLoad(specifier, ...args);
  require("next/headers").cookies = async () => ({
    get: (name: string) => name === "fl_session" && request.getStore() ? { value: request.getStore() } : undefined,
  });
  require("next/cache").revalidatePath = () => {};
  require("next/server").after = () => {};
  globalThis.fetch = async () => { throw new Error("External network disabled in data audit"); };
  const { getDb, schema } = await import("../src/db");
  const { publishClasses, updateClass, deleteClass } = await import("../src/app/actions/classes");
  const { setGoing } = await import("../src/app/actions/going");
  const { updateGroupVisibility, addGroupPost, addGroupClasses, toggleGroupFavorite, leaveGroup, removeGroupMember } = await import("../src/app/actions/groups");
  const { youDashboardData } = await import("../src/app/actions/you");
  const { followingDirectoryBatch } = await import("../src/lib/following-directory");
  const { studioAccess } = await import("../src/lib/studioaccess");
  const { getSessionUserId } = await import("../src/lib/session");
  const { runsOn, dowOfDate, todayIso } = await import("../src/lib/format");
  const { buildDiscoverFeed } = await import("../src/lib/discoverfeed");
  const { publicGroupOccurrenceFilter, visibleGroupFilter } = await import("../src/lib/group-schedule");
  const db = await getDb();
  const [coach, member, outsider, gym] = await db.insert(schema.users).values([
    { email: "coach@example.test", name: "Coach", handle: "integritycoach", onboardedAt: new Date(), kind: "coach", timeZone: "America/New_York" },
    { email: "member@example.test", name: "Member", handle: "integritymember", onboardedAt: new Date(), kind: "fan" },
    { email: "outsider@example.test", name: "Outsider", handle: "integrityoutsider", onboardedAt: new Date(), kind: "fan" },
    { email: "gym@example.test", name: "Gym", kind: "gym" },
  ]).returning();
  const [studio, otherStudio] = await db.insert(schema.studios).values([
    { name: "Integrity studio", slug: "integrity-studio", address: "1 Test Street", timeZone: "America/New_York" },
    { name: "Other studio", slug: "other-studio", address: "2 Test Street", timeZone: "Europe/London" },
  ]).returning();
  const [group] = await db.insert(schema.groups).values({
    name: "Integrity group", slug: "integrity-group", ownerUserId: coach.id,
    visibility: "private", inviteToken: randomBytes(24).toString("hex"),
  }).returning();
  await db.insert(schema.groupMembers).values([
    { groupId: group.id, userId: coach.id, role: "owner" },
    { groupId: group.id, userId: member.id, role: "member" },
  ]);
  const tokens = new Map<string, string>();
  for (const user of [coach, member, outsider, gym]) tokens.set(user.id, await new SignJWT({ uid: user.id, sv: 0 })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.SESSION_SECRET)));
  const as = <T>(id: string | null, work: () => Promise<T>) => request.run(id ? tokens.get(id)! : null, work);
  const input = (name: string, overrides = {}) => ({ name, days: [0, 2], startTime: "08:00", durationMin: 50,
    studioId: studio.id, isPublic: true, links: [], ...overrides });
  const date = "2096-04-09"; // Monday, distant future; independent of audit day.
  assert.equal(dowOfDate(date), 0);
  const results: { stage: number; name: string; ok: boolean; error?: string }[] = [];
  async function check(at: number, name: string, work: () => Promise<void>) {
    if (stage && stage !== at) return;
    try { await work(); results.push({ stage: at, name, ok: true }); console.log(`PASS ${at}: ${name}`); }
    catch (error) { const message = error instanceof Error ? error.message : String(error); results.push({ stage: at, name, ok: false, error: message }); console.error(`FAIL ${at}: ${name}: ${message}`); }
  }
  await check(2, "recurrence end date and cancellations", async () => {
    const c = { specificDate: null, dayOfWeek: 0, endsOn: "2096-04-16", skipDates: [date] };
    assert.equal(runsOn(c, date, 0), false);
    assert.equal(runsOn(c, "2096-04-16", 0), true);
    assert.equal(runsOn(c, "2096-04-23", 0), false);
    assert.equal(runsOn(c, "2096-04-10", 1), false);
  });
  await check(2, "teaching needs no account switch and failed saves keep existing identity", async () => {
    const [person] = await db.insert(schema.users).values({
      email: "new-teacher@example.test", name: "New teacher", handle: "newteacher",
      kind: "fan", onboardedAt: new Date(), discoverable: false,
    }).returning();
    tokens.set(person.id, await new SignJWT({ uid: person.id, sv: 0 })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.SESSION_SECRET)));
    const { globalComposerData } = await import("../src/app/actions/composer");
    assert.equal((await as(person.id, globalComposerData))?.canCoach, true);
    const failed = await as(person.id, () => publishClasses(input("Invalid teaching", { studioId: null })));
    assert.equal(failed.ok, false);
    assert.equal((await db.select().from(schema.users).where(eq(schema.users.id, person.id)))[0].kind, "fan");
    const saved = await as(person.id, () => publishClasses(input("First teaching class")));
    assert(saved.ok && saved.id);
    const [after] = await db.select().from(schema.users).where(eq(schema.users.id, person.id));
    assert.equal(after.kind, "coach");
    assert.equal(after.discoverable, false, "publishing preserves the profile visibility preference");
    assert.equal(after.handle, person.handle);
    assert.equal((await db.select().from(schema.classes).where(eq(schema.classes.id, saved.id)))[0].userId, person.id);
    await as(person.id, () => deleteClass(saved.id!, "all"));
  });
  await check(2, "editing preserves cancellation and saved attendance", async () => {
    const saved = await as(coach.id, () => publishClasses(input("Preserve saved")));
    assert(saved.ok && saved.id);
    assert((await as(member.id, () => setGoing(saved.id!, date, true))).ok);
    assert((await as(coach.id, () => deleteClass(saved.id!, "occurrence", "2096-04-16"))).ok);
    const edited = await as(coach.id, () => updateClass(saved.id!, input("Preserve saved", { startTime: "09:00" })));
    assert(edited.ok && edited.id);
    const [row] = await db.select().from(schema.classes).where(eq(schema.classes.id, edited.id));
    assert(row.skipDates.includes("2096-04-16"));
    const marks = await db.select().from(schema.attendances).where(eq(schema.attendances.classId, edited.id));
    assert.equal(marks.length, 1); assert.equal(marks[0].occurrenceDate, date);
  });
  await check(2, "editing retains classes and update discussions in groups", async () => {
    const saved = await as(coach.id, () => publishClasses(input("Group retained", { days: [0] })));
    assert(saved.ok && saved.id);
    await db.insert(schema.groupClasses).values({ groupId: group.id, classId: saved.id, occurrenceDate: date });
    const [post] = await db.insert(schema.groupPosts).values({ groupId: group.id, authorUserId: coach.id, kind: "class_added", classId: saved.id, occurrenceDate: date }).returning();
    const [reply] = await db.insert(schema.groupPostComments).values({ postId: post.id, authorUserId: member.id, body: "See you there" }).returning();
    const [like] = await db.insert(schema.calendarActivityLikes).values({ actorUserId: coach.id, classId: saved.id, occurrenceDate: date, activityKind: "teaching", userId: member.id }).returning();
    const [comment] = await db.insert(schema.calendarActivityComments).values({ actorUserId: coach.id, classId: saved.id, occurrenceDate: date, activityKind: "teaching", authorUserId: member.id, body: "Looking forward to it" }).returning();
    const edited = await as(coach.id, () => updateClass(saved.id!, input("Group retained", { days: [0], description: "Bring a mat" })));
    assert(edited.ok && edited.id);
    assert.equal(edited.id, saved.id, "published/shared class URL must stay valid");
    assert.equal((await db.select().from(schema.groupClasses).where(and(eq(schema.groupClasses.groupId, group.id), eq(schema.groupClasses.classId, edited.id)))).length, 1);
    assert.equal((await db.select().from(schema.groupPosts).where(eq(schema.groupPosts.id, post.id))).length, 1);
    assert.equal((await db.select().from(schema.groupPostComments).where(eq(schema.groupPostComments.id, reply.id))).length, 1);
    assert.equal((await db.select().from(schema.calendarActivityLikes).where(eq(schema.calendarActivityLikes.id, like.id))).length, 1);
    assert.equal((await db.select().from(schema.calendarActivityComments).where(eq(schema.calendarActivityComments.id, comment.id))).length, 1);
  });
  await check(2, "one-off reschedule moves saved/group occurrences to its new date", async () => {
    const saved = await as(coach.id, () => publishClasses(input("One-off moved", { specificDate: date })));
    assert(saved.ok && saved.id);
    assert((await as(member.id, () => setGoing(saved.id!, date, true))).ok);
    await db.insert(schema.groupClasses).values({ groupId: group.id, classId: saved.id, occurrenceDate: date });
    const [post] = await db.insert(schema.groupPosts).values({ groupId: group.id, authorUserId: coach.id, kind: "class_added", classId: saved.id, occurrenceDate: date }).returning();
    const [like] = await db.insert(schema.calendarActivityLikes).values({ actorUserId: coach.id, classId: saved.id, occurrenceDate: date, activityKind: "teaching", userId: member.id }).returning();
    const nextDate = "2096-04-10";
    const edited = await as(coach.id, () => updateClass(saved.id!, input("One-off moved", { specificDate: nextDate })));
    assert(edited.ok && edited.id);
    const [mark] = await db.select().from(schema.attendances).where(eq(schema.attendances.classId, edited.id));
    assert.equal(mark?.occurrenceDate, nextDate);
    const [item] = await db.select().from(schema.groupClasses).where(eq(schema.groupClasses.classId, edited.id));
    assert.equal(item?.occurrenceDate, nextDate);
    assert.equal((await db.select().from(schema.groupPosts).where(eq(schema.groupPosts.id, post.id)))[0]?.occurrenceDate, nextDate);
    assert.equal((await db.select().from(schema.calendarActivityLikes).where(eq(schema.calendarActivityLikes.id, like.id)))[0]?.occurrenceDate, nextDate);
  });
  await check(2, "removing one weekday clears only its references", async () => {
    const saved = await as(coach.id, () => publishClasses(input("Remove weekday")));
    assert(saved.ok && saved.id);
    const rows = await db.select().from(schema.classes).where(eq(schema.classes.name, "Remove weekday"));
    const monday = rows.find(row => row.dayOfWeek === 0)!;
    const wednesday = rows.find(row => row.dayOfWeek === 2)!;
    await as(member.id, () => setGoing(monday.id, date, true));
    await as(member.id, () => setGoing(wednesday.id, "2096-04-11", true));
    await db.insert(schema.groupClasses).values([{ groupId: group.id, classId: monday.id, occurrenceDate: date }, { groupId: group.id, classId: wednesday.id, occurrenceDate: "2096-04-11" }]);
    assert((await as(coach.id, () => updateClass(monday.id, input("Remove weekday", { days: [0] })))).ok);
    assert.equal((await db.select().from(schema.classes).where(eq(schema.classes.id, wednesday.id))).length, 0);
    assert.equal((await db.select().from(schema.attendances).where(eq(schema.attendances.classId, wednesday.id))).length, 0);
    assert.equal((await db.select().from(schema.groupClasses).where(eq(schema.groupClasses.classId, wednesday.id))).length, 0);
    assert.equal((await db.select().from(schema.attendances).where(eq(schema.attendances.classId, monday.id))).length, 1);
    assert.equal((await db.select().from(schema.groupClasses).where(eq(schema.groupClasses.classId, monday.id))).length, 1);
  });
  await check(2, "same class name at separate studios stays independent", async () => {
    const a = await as(coach.id, () => publishClasses(input("Two places")));
    const b = await as(coach.id, () => publishClasses(input("Two places", { studioId: otherStudio.id })));
    assert(a.ok && a.id && b.ok && b.id);
    await as(coach.id, () => updateClass(a.id!, input("Two places", { description: "Only here" })));
    const [row] = await db.select().from(schema.classes).where(eq(schema.classes.id, b.id));
    assert(row); assert.equal(row.description, null); assert.equal(row.timeZone, "Europe/London");
  });
  await check(2, "impossible dates and times are refused", async () => {
    for (const bad of [{ specificDate: "2096-02-31" }, { endsOn: "2096-02-31" }, { startTime: "25:90" }]) {
      assert.equal((await as(coach.id, () => publishClasses(input("Invalid input", bad)))).ok, false, JSON.stringify(bad));
    }
  });
  await check(2, "group schedules and summaries omit canceled, ended and private occurrences", async () => {
    const saved = await as(coach.id, () => publishClasses(input("Group visibility", { days: [0] })));
    assert(saved.ok && saved.id);
    const dates = [date, "2096-04-16", "2096-04-23"];
    await db.insert(schema.groupClasses).values(dates.map(occurrenceDate => ({ groupId: group.id, classId: saved.id!, occurrenceDate })));
    const visible = () => db.select({ iso: schema.groupClasses.occurrenceDate })
      .from(schema.groupClasses).innerJoin(schema.classes, eq(schema.classes.id, schema.groupClasses.classId))
      .where(and(eq(schema.groupClasses.classId, saved.id!), publicGroupOccurrenceFilter()))
      .orderBy(schema.groupClasses.occurrenceDate);
    assert.equal((await visible()).length, 3);
    assert((await as(member.id, () => setGoing(saved.id!, "2096-04-16", true))).ok);
    assert((await as(coach.id, () => deleteClass(saved.id!, "occurrence", date))).ok);
    assert.deepEqual((await visible()).map(row => row.iso), dates.slice(1));
    assert((await as(coach.id, () => updateClass(saved.id!, input("Group visibility", { days: [0], endsOn: "2096-04-16" })))).ok);
    assert.deepEqual((await visible()).map(row => row.iso), ["2096-04-16"]);
    assert((await as(coach.id, () => updateClass(saved.id!, input("Group visibility", { days: [0], isPublic: false })))).ok);
    assert.equal((await visible()).length, 0);
    const dashboard = await as(member.id, youDashboardData);
    assert(dashboard);
    assert.equal(dashboard.savedItems.some(item => item.classId === saved.id), false, "private class cannot remain visible in saved-item summaries");
  });
  await check(2, "Following activity rechecks the saved class recurrence after edits", async () => {
    const future = new Date(`${todayIso()}T00:00:00Z`);
    future.setUTCDate(future.getUTCDate() + 1);
    const first = future.toISOString().slice(0, 10);
    future.setUTCDate(future.getUTCDate() + 7);
    const later = future.toISOString().slice(0, 10);
    const details = input("Following recurrence", { days: [dowOfDate(first)], startTime: "23:00" });
    const saved = await as(coach.id, () => publishClasses(details));
    assert(saved.ok && saved.id);
    assert((await as(member.id, () => setGoing(saved.id!, later, true))).ok);
    await db.insert(schema.subscribers).values({ trainerUserId: member.id, userId: outsider.id, email: outsider.email }).onConflictDoNothing();
    const visible = async () => (await buildDiscoverFeed(outsider.id, outsider, { calendarOnly: true, endDay: 14 })).items.some(item => item.classId === saved.id && item.iso === later && item.activityKind === "going");
    assert.equal(await visible(), true);
    assert((await as(coach.id, () => updateClass(saved.id!, { ...details, endsOn: first }))).ok);
    assert.equal((await db.select().from(schema.attendances).where(eq(schema.attendances.classId, saved.id))).length, 1, "the loader must recheck a still-existing mark");
    assert.equal(await visible(), false);
  });
  await check(3, "duplicate save requests and two viewers stay independent", async () => {
    const saved = await as(coach.id, () => publishClasses(input("Concurrent marks", { days: [0] })));
    assert(saved.ok && saved.id);
    await Promise.all([as(member.id, () => setGoing(saved.id!, date, true)), as(member.id, () => setGoing(saved.id!, date, true)), as(outsider.id, () => setGoing(saved.id!, date, true))]);
    assert.equal((await db.select().from(schema.attendances).where(eq(schema.attendances.classId, saved.id))).length, 2);
    await as(member.id, () => setGoing(saved.id!, date, false));
    const marks = await db.select().from(schema.attendances).where(eq(schema.attendances.classId, saved.id));
    assert.equal(marks.length, 1); assert.equal(marks[0].userId, outsider.id);
  });
  await check(3, "duplicate class publish does not create duplicate weekdays", async () => {
    await Promise.all([as(coach.id, () => publishClasses(input("Duplicate publish"))), as(coach.id, () => publishClasses(input("Duplicate publish")))]);
    const rows = await db.select().from(schema.classes).where(eq(schema.classes.name, "Duplicate publish"));
    assert.equal(rows.length, 2); assert.equal(new Set(rows.map(row => row.seriesId)).size, 1);
  });
  await check(3, "overlapping edits leave a coherent series and stable shared id", async () => {
    const saved = await as(coach.id, () => publishClasses(input("Overlapping edits")));
    assert(saved.ok && saved.id);
    const edits = await Promise.all([
      as(coach.id, () => updateClass(saved.id!, input("Overlapping edits", { days: [0, 2], startTime: "09:00" }))),
      as(coach.id, () => updateClass(saved.id!, input("Overlapping edits", { days: [0, 4], startTime: "10:00" }))),
    ]);
    assert(edits.every(edit => edit.ok));
    const rows = await db.select().from(schema.classes).where(eq(schema.classes.name, "Overlapping edits"));
    assert.equal(rows.length, 2); assert.equal(new Set(rows.map(row => row.startTime)).size, 1);
    assert.equal(rows.find(row => row.dayOfWeek === 0)?.id, saved.id);
    assert.equal(rows.map(row => row.dayOfWeek).sort().join(","), rows[0].startTime === "09:00" ? "0,2" : "0,4");
  });
  await check(3, "late account response cannot repopulate another account cache", async () => {
    const memory = await import("../src/lib/client-memory");
    Object.assign(globalThis, { window: {} });
    memory.setClientMemoryScope("account-a");
    let release!: (value: string) => void;
    const pending = memory.loadClientMemory("private-calendar", () => new Promise<string>(resolve => { release = resolve; }));
    await Promise.resolve();
    memory.setClientMemoryScope("account-b");
    release("account-a-calendar");
    await pending;
    assert.equal(memory.readClientMemory("private-calendar"), null);
    assert.equal(await memory.loadClientMemory("private-calendar", () => Promise.resolve("account-b-calendar")), "account-b-calendar");
    memory.setClientMemoryScope(null);
    Reflect.deleteProperty(globalThis, "window");
  });
  await check(4, "wrapped database serialization failures retry", async () => {
    const original = db.transaction.bind(db);
    let attempts = 0;
    db.transaction = (async (...args: Parameters<typeof original>) => {
      attempts++;
      if (attempts === 1) throw new Error("Drizzle query failed", { cause: Object.assign(new Error("serialization failure"), { code: "40001" }) });
      return original(...args);
    }) as typeof db.transaction;
    try { assert((await as(coach.id, () => publishClasses(input("Retry transaction")))).ok); assert.equal(attempts, 2); }
    finally { db.transaction = original; }
  });
  await check(4, "failed class edit rolls back its entire schedule", async () => {
    const saved = await as(coach.id, () => publishClasses(input("Rollback")));
    assert(saved.ok && saved.id);
    const before = await db.select().from(schema.classes).where(eq(schema.classes.name, "Rollback"));
    await db.execute(sql`create function audit_reject_class() returns trigger language plpgsql as $$ begin if NEW.name = 'Injected failure' then raise exception 'audit injected failure'; end if; return NEW; end $$`);
    await db.execute(sql`create trigger audit_failure before insert or update on classes for each row execute function audit_reject_class()`);
    try { await assert.rejects(as(coach.id, () => updateClass(saved.id!, input("Injected failure")))); }
    finally { await db.execute(sql`drop trigger audit_failure on classes`); await db.execute(sql`drop function audit_reject_class()`); }
    assert.deepEqual(await db.select().from(schema.classes).where(eq(schema.classes.name, "Rollback")), before);
  });
  await check(4, "persistent database conflicts stop after bounded retries", async () => {
    const original = db.transaction.bind(db);
    let attempts = 0;
    db.transaction = (async () => {
      attempts++;
      throw new Error("Drizzle query failed", { cause: Object.assign(new Error("deadlock"), { code: "40P01" }) });
    }) as typeof db.transaction;
    try {
      const result = await as(coach.id, () => publishClasses(input("Bounded conflict")));
      assert.equal(result.ok, false); assert.match(result.error || "", /another window/); assert.equal(attempts, 3);
    } finally { db.transaction = original; }
  });
  await check(4, "bad image upload cannot partially edit a schedule", async () => {
    const saved = await as(coach.id, () => publishClasses(input("Upload failure")));
    assert(saved.ok && saved.id);
    await assert.rejects(as(coach.id, () => updateClass(saved.id!, input("Not committed", { image: "data:image/png;base64,PHN2Zy8+" }))));
    assert.equal((await db.select().from(schema.classes).where(eq(schema.classes.id, saved.id)))[0]?.name, "Upload failure");
  });
  await check(4, "failed cached read can recover on the next request", async () => {
    const memory = await import("../src/lib/client-memory");
    const { withTimeout } = await import("../src/lib/async");
    Object.assign(globalThis, { window: {} });
    memory.setClientMemoryScope("retry-account");
    await assert.rejects(memory.loadClientMemory("schedule", () => withTimeout(new Promise(() => {}), 5)));
    assert.equal(await memory.loadClientMemory("schedule", () => Promise.resolve("recovered")), "recovered");
    memory.setClientMemoryScope(null);
    Reflect.deleteProperty(globalThis, "window");
  });
  await check(5, "signed-out users cannot publish and outsiders cannot edit another person", async () => {
    assert.equal((await as(null, () => publishClasses(input("No session")))).ok, false);
    const saved = await as(coach.id, () => publishClasses(input("Protected")));
    assert(saved.ok && saved.id);
    assert.equal((await as(outsider.id, () => updateClass(saved.id!, input("Overwritten")))).ok, false);
    assert.equal((await as(outsider.id, () => deleteClass(saved.id!))).count, 0);
    assert.equal((await db.select().from(schema.classes).where(eq(schema.classes.id, saved.id))).length, 1);
  });
  await check(5, "private group favorites require actual membership", async () => {
    assert.equal((await as(outsider.id, () => toggleGroupFavorite(group.slug))).ok, false);
    assert.equal((await as(null, () => toggleGroupFavorite(group.slug))).ok, false);
    const accepted = await as(member.id, () => toggleGroupFavorite(group.slug));
    assert(accepted.ok && accepted.selected);
    assert.equal((await db.select().from(schema.groupFavorites).where(and(eq(schema.groupFavorites.groupId, group.id), eq(schema.groupFavorites.userId, outsider.id)))).length, 0);
  });
  await check(5, "stale favorites cannot expose private group metadata or schedules", async () => {
    await db.insert(schema.groupFavorites).values({ groupId: group.id, userId: outsider.id });
    const rows = await db.select({ id: schema.groups.id }).from(schema.groups)
      .leftJoin(schema.groupFavorites, eq(schema.groupFavorites.groupId, schema.groups.id))
      .where(and(eq(schema.groupFavorites.userId, outsider.id), visibleGroupFilter(outsider.id)));
    assert.equal(rows.length, 0);
    const dashboard = await as(outsider.id, youDashboardData);
    assert(dashboard); assert.equal(dashboard.favoriteGroups.some(item => item.id === group.id), false);
    const removed = await as(outsider.id, () => toggleGroupFavorite(group.slug));
    assert(removed.ok && removed.selected === false, "an inaccessible favorite can still be removed");
  });
  await check(5, "a public group made private disappears from a nonmember's following directory", async () => {
    const [changing] = await db.insert(schema.groups).values({ name: "Changing privacy", slug: "changing-privacy", ownerUserId: coach.id, visibility: "public", inviteToken: randomBytes(24).toString("hex") }).returning();
    await db.insert(schema.groupMembers).values({ groupId: changing.id, userId: coach.id, role: "owner" });
    assert((await as(outsider.id, () => toggleGroupFavorite(changing.slug))).ok);
    assert((await as(outsider.id, () => followingDirectoryBatch("groups", "following")))?.entities.some(item => item.id === changing.id));
    assert((await as(coach.id, () => updateGroupVisibility(changing.slug, "private"))).ok);
    const directory = await as(outsider.id, () => followingDirectoryBatch("groups", "following"));
    assert(directory); assert.equal(directory.entities.some(item => item.id === changing.id), false);
    const dashboard = await as(outsider.id, youDashboardData);
    assert(dashboard); assert.equal(dashboard.favoriteGroups.some(item => item.id === changing.id), false);
    assert((await as(coach.id, () => toggleGroupFavorite(changing.slug))).ok);
    assert((await as(coach.id, () => followingDirectoryBatch("groups", "following")))?.entities.some(item => item.id === changing.id), "the owner still has access");
  });
  await check(5, "leaving or removal from a private group clears its favorite", async () => {
    const favorites = () => db.select().from(schema.groupFavorites).where(and(eq(schema.groupFavorites.groupId, group.id), eq(schema.groupFavorites.userId, member.id)));
    assert.equal((await favorites()).length, 1);
    assert((await as(member.id, () => leaveGroup(group.slug))).ok);
    assert.equal((await favorites()).length, 0);
    assert.equal((await as(member.id, () => toggleGroupFavorite(group.slug))).ok, false);
    await db.insert(schema.groupMembers).values({ groupId: group.id, userId: member.id, role: "member" });
    assert((await as(member.id, () => toggleGroupFavorite(group.slug))).ok);
    assert((await as(coach.id, () => removeGroupMember(group.slug, member.id))).ok);
    assert.equal((await favorites()).length, 0);
    assert.equal((await as(member.id, () => addGroupPost(group.slug, "Removed member"))).ok, false);
    await db.insert(schema.groupMembers).values({ groupId: group.id, userId: member.id, role: "member" });
  });
  await check(5, "private classes, own classes and blocked coaches cannot be saved", async () => {
    const saved = await as(coach.id, () => publishClasses(input("Visibility")));
    const hidden = await as(coach.id, () => publishClasses(input("Private", { isPublic: false })));
    assert(saved.ok && saved.id && hidden.ok && hidden.id);
    assert.equal((await as(coach.id, () => setGoing(saved.id!, date, true))).ok, false);
    assert.equal((await as(member.id, () => setGoing(hidden.id!, date, true))).ok, false);
    await db.insert(schema.blocks).values({ blockerUserId: coach.id, blockedUserId: outsider.id });
    assert.equal((await as(outsider.id, () => setGoing(saved.id!, date, true))).ok, false);
  });
  await check(5, "a followed friend's activity cannot reveal a blocked coach's class", async () => {
    const future = new Date(`${todayIso()}T00:00:00Z`);
    future.setUTCDate(future.getUTCDate() + 1);
    const iso = future.toISOString().slice(0, 10);
    const saved = await as(coach.id, () => publishClasses(input("Blocked activity", { specificDate: iso, startTime: "23:00" })));
    assert(saved.ok && saved.id);
    assert((await as(member.id, () => setGoing(saved.id!, iso, true))).ok);
    await db.insert(schema.subscribers).values({ trainerUserId: member.id, userId: outsider.id, email: outsider.email }).onConflictDoNothing();
    const feed = await buildDiscoverFeed(outsider.id, outsider, { calendarOnly: true, endDay: 14 });
    assert.equal(feed.items.some(item => item.classId === saved.id), false);
  });
  await check(5, "studio manager removal takes effect on next request", async () => {
    await db.insert(schema.studioManagers).values({ studioId: studio.id, userId: member.id });
    assert((await as(member.id, () => studioAccess(studio.id, member))).canEdit);
    assert.equal((await as(coach.id, () => studioAccess(studio.id, coach))).canEdit, false);
    await db.delete(schema.studioManagers).where(eq(schema.studioManagers.userId, member.id));
    assert.equal((await as(member.id, () => studioAccess(studio.id, member))).canEdit, false);
    assert((await as(coach.id, () => studioAccess(studio.id, coach))).canEdit);
  });
  await check(5, "group membership/admin removal is enforced by actions", async () => {
    assert.equal((await as(outsider.id, () => addGroupPost(group.slug, "Outsider post"))).ok, false);
    assert.equal((await as(member.id, () => updateGroupVisibility(group.slug, "public"))).ok, false);
    await db.update(schema.groupMembers).set({ role: "admin" }).where(and(eq(schema.groupMembers.groupId, group.id), eq(schema.groupMembers.userId, member.id)));
    assert((await as(member.id, () => updateGroupVisibility(group.slug, "private"))).ok);
    await db.update(schema.groupMembers).set({ role: "member" }).where(and(eq(schema.groupMembers.groupId, group.id), eq(schema.groupMembers.userId, member.id)));
    assert.equal((await as(member.id, () => updateGroupVisibility(group.slug, "public"))).ok, false);
    assert.equal((await as(member.id, () => addGroupClasses(group.slug, []))).ok, false);
  });
  await check(5, "session revocation invalidates an existing device token", async () => {
    assert.equal(await as(member.id, getSessionUserId), member.id);
    await db.update(schema.users).set({ sessionVersion: 1 }).where(eq(schema.users.id, member.id));
    assert.equal(await as(member.id, getSessionUserId), null);
    assert.equal((await as(member.id, () => publishClasses(input("Revoked")))).ok, false);
  });
  console.log(JSON.stringify({ stages: stage || [2, 3, 4, 5], passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok), boundary: "Disposable embedded PostgreSQL; no real network, mail/push or native UI. PostgreSQL multi-connection contention requires separate infrastructure." }, null, 2));
  process.exit(results.some(result => !result.ok) ? 1 : 0);
}
void main();
