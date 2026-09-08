import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";
import { SignJWT } from "jose";
import * as schema from "../src/db/schema";
import { boundedCalendarWindow, followingMonthWindow, rollingCalendarWindow } from "../src/lib/calendar-window";

async function main() {
  if (process.env.DATABASE_URL || process.env.VERCEL) throw new Error("Calendar-window checks are isolated/local only");
  assert.deepEqual(followingMonthWindow("2028-02", "2027-12-19"), { month: "2028-02", from: "2028-02-01", through: "2028-02-29" });
  assert.deepEqual(followingMonthWindow("2026-09", "2026-09-07"), { month: "2026-09", from: "2026-09-07", through: "2026-09-30" });
  for (const month of [null, 123, {}, "2026-00", "2026-13", "2026-2", "2026-09-01", "2026-08", "2031-10"]) {
    assert.equal(followingMonthWindow(month, "2026-09-07"), null, `Reject ${JSON.stringify(month)}`);
  }
  assert(followingMonthWindow("2031-09", "2026-09-07"));
  assert.throws(() => boundedCalendarWindow({ from: "2027-02-29", through: "2027-03-01" }));
  assert.throws(() => boundedCalendarWindow({ from: "2028-02-01", through: "2028-03-03" }));
  assert.deepEqual(rollingCalendarWindow("2026-12-20", 2, 180), { from: "2026-12-22", through: "2027-01-21" });
  console.log("PASS: real month boundaries, leap years, 31-day cap and five-year input horizon");

  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("External network disabled in calendar-window check"); };
  const request = new AsyncLocalStorage<string | null>();
  const require = createRequire(import.meta.url);
  const moduleRuntime = require("node:module");
  const originalLoad = moduleRuntime._load.bind(moduleRuntime);
  moduleRuntime._load = (specifier: string, ...args: unknown[]) => specifier === "server-only" ? {} : originalLoad(specifier, ...args);
  const headers = require("next/headers");
  const originalCookies = headers.cookies;
  headers.cookies = async () => ({ get: (name: string) => name === "fl_session" && request.getStore() ? { value: request.getStore() } : undefined });
  const client = new PGlite();
  const db = drizzle(client, { schema });
  globalThis.__fittlistDb = Promise.resolve(db);
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    const { loadCalendarRemainder, loadFollowingCalendarMonth } = await import("../src/app/actions/calendar-stream");
    const { todayIso, dowOfDate } = await import("../src/lib/format");
    const today = todayIso();
    const day30 = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
    const day31 = new Date(Date.parse(`${today}T00:00:00Z`) + 31 * 86_400_000).toISOString().slice(0, 10);
    const monthDate = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    monthDate.setUTCMonth(monthDate.getUTCMonth() + 2);
    const month = monthDate.toISOString().slice(0, 7);
    const window = followingMonthWindow(month, today)!;
    const middle = `${month}-15`;
    const before = new Date(Date.parse(`${window.from}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const after = new Date(Date.parse(`${window.through}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const [viewer, teacher, outsider, blocked, groupTeacher] = await db.insert(schema.users).values([
      { name: "Window viewer", email: "window-viewer@example.test", handle: "windowviewer", kind: "fan" },
      { name: "Window teacher", email: "window-teacher@example.test", handle: "windowteacher", kind: "coach" },
      { name: "Window outsider", email: "window-outsider@example.test", handle: "windowoutsider", kind: "fan" },
      { name: "Blocked teacher", email: "window-blocked@example.test", handle: "windowblocked", kind: "coach" },
      { name: "Group teacher", email: "window-group@example.test", handle: "windowgroup", kind: "coach" },
    ]).returning();
    await db.insert(schema.subscribers).values([teacher, blocked].map(user => ({ trainerUserId: user.id, userId: viewer.id, email: viewer.email })));
    await db.insert(schema.blocks).values({ blockerUserId: viewer.id, blockedUserId: blocked.id });
    const classes = await db.insert(schema.classes).values([
      { name: "Future recurring", specificDate: null, dayOfWeek: 0 },
      { name: "Future first day", specificDate: window.from },
      { name: "Future last day", specificDate: window.through },
      { name: "Future middle", specificDate: middle },
      { name: "Before month", specificDate: before },
      { name: "After month", specificDate: after },
      { name: "Private future", isPublic: false },
      { name: "Canceled future", skipDates: [middle] },
      { name: "Ended future", specificDate: null, endsOn: before },
      { name: "Blocked future", userId: blocked.id },
      { name: "Private group future", userId: groupTeacher.id },
      { name: "Initial horizon last day", specificDate: day30 },
      { name: "Outside initial horizon", specificDate: day31 },
    ].map(details => ({ userId: teacher.id, dayOfWeek: dowOfDate(middle), specificDate: middle,
      startTime: "12:00", durationMin: 45, isPublic: true, ...details }))).returning();
    const [group] = await db.insert(schema.groups).values({ name: "Private future group", slug: "private-future-group", visibility: "private", ownerUserId: groupTeacher.id, inviteToken: randomBytes(24).toString("hex") }).returning();
    await db.insert(schema.groupMembers).values({ groupId: group.id, userId: viewer.id });
    await db.insert(schema.groupFavorites).values({ groupId: group.id, userId: viewer.id });
    await db.insert(schema.groupClasses).values({ groupId: group.id, classId: classes[10].id, occurrenceDate: middle });
    const tokens = new Map<string, string>();
    for (const user of [viewer, outsider]) tokens.set(user.id, await new SignJWT({ uid: user.id, sv: 0 }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.SESSION_SECRET)));
    const as = <T>(id: string | null, work: () => Promise<T>) => request.run(id ? tokens.get(id)! : null, work);
    const initial = await as(viewer.id, loadCalendarRemainder);
    assert(initial);
    assert(initial.items.some(item => item.name === "Initial horizon last day"));
    assert(!initial.items.some(item => item.name === "Outside initial horizon"));
    assert(initial.items.every(item => item.iso <= day30));
    assert.equal(initial.items.some(item => item.iso >= window.from), false, "Initial remainder must not preload future months");
    const result = await as(viewer.id, () => loadFollowingCalendarMonth(month));
    assert(result);
    assert.equal(result.month, month);
    assert.equal(result.from, window.from);
    assert.equal(result.through, window.through);
    assert(result.items.every(item => item.iso >= window.from && item.iso <= window.through));
    const names = new Set(result.items.map(item => item.name));
    for (const name of ["Future recurring", "Future first day", "Future last day", "Future middle", "Private group future"]) assert(names.has(name), `Missing ${name}`);
    for (const name of ["Before month", "After month", "Private future", "Canceled future", "Ended future", "Blocked future"]) assert(!names.has(name), `Exposed ${name}`);
    assert.deepEqual(result.items.find(item => item.name === "Private group future")?.groupIds, [group.id]);
    assert.deepEqual(result.items.find(item => item.name === "Future middle")?.groupIds, []);
    assert.equal(new Set(result.items.filter(item => item.name === "Future recurring").map(item => item.iso)).size,
      Array.from({ length: Number(window.through.slice(8)) }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`).filter(iso => dowOfDate(iso) === 0).length);
    console.log("PASS: month beyond day 30 loads first/last/recurring classes without adjacent, canceled, ended, private or blocked classes");
    const [secondGroup] = await db.insert(schema.groups).values({ name: "Second future group", slug: "second-future-group", visibility: "private", ownerUserId: groupTeacher.id, inviteToken: randomBytes(24).toString("hex") }).returning();
    await db.insert(schema.groupMembers).values({ groupId: secondGroup.id, userId: viewer.id });
    const duplicates = await db.insert(schema.classes).values([0, 1].map(() => ({ userId: groupTeacher.id, name: "Dedupe future", specificDate: middle,
      dayOfWeek: dowOfDate(middle), startTime: "13:00", durationMin: 45, isPublic: true }))).returning();
    await db.insert(schema.groupClasses).values([{ groupId: group.id, classId: duplicates[0].id, occurrenceDate: middle }, { groupId: secondGroup.id, classId: duplicates[1].id, occurrenceDate: middle }]);
    // A group occurrence remains visible through a separate followed coach,
    // while its membership metadata must disappear after access is revoked.
    await db.insert(schema.groupClasses).values({ groupId: group.id, classId: classes[3].id, occurrenceDate: middle });
    const withSharedGroup = await as(viewer.id, () => loadFollowingCalendarMonth(month));
    assert.deepEqual(withSharedGroup?.items.find(item => item.name === "Future middle")?.groupIds, [group.id]);
    const deduped = withSharedGroup?.items.filter(item => item.name === "Dedupe future");
    assert.equal(deduped?.length, 1);
    assert.deepEqual(new Set(deduped?.[0].groupIds), new Set([group.id, secondGroup.id]), "Merged calendar row retains both group sources");
    await db.delete(schema.groupMembers).where(and(eq(schema.groupMembers.groupId, group.id), eq(schema.groupMembers.userId, viewer.id)));
    await db.delete(schema.groupMembers).where(and(eq(schema.groupMembers.groupId, secondGroup.id), eq(schema.groupMembers.userId, viewer.id)));
    const revoked = await as(viewer.id, () => loadFollowingCalendarMonth(month));
    assert(revoked && !revoked.items.some(item => item.name === "Private group future"), "Stale group favorite must not preserve private membership access");
    assert.deepEqual(revoked.items.find(item => item.name === "Future middle")?.groupIds, [], "Separately followed class must lose revoked group metadata");
    const unrelated = await as(outsider.id, () => loadFollowingCalendarMonth(month));
    assert(unrelated && unrelated.items.length === 0, "Another account must not inherit following data");
    assert.equal(await as(null, () => loadFollowingCalendarMonth(month)), null);
    await assert.rejects(as(viewer.id, () => loadFollowingCalendarMonth("2026-13")));
    console.log("PASS: month loads recheck account, group membership and unauthenticated access");

    // Identities must not wait for later occurrence windows or stop at 16.
    const extraCoaches = await db.insert(schema.users).values(Array.from({ length: 20 }, (_, i) => ({
      name: `Rail coach ${i}`, email: `rail-${i}@example.test`, handle: `railcoach${i}`, kind: "coach",
      photo: "large-original-not-needed", photoThumb: `/rail-${i}.webp`,
    }))).returning();
    await db.insert(schema.subscribers).values(extraCoaches.map(coach => ({
      trainerUserId: coach.id, userId: viewer.id, email: viewer.email,
    })));
    const { buildDiscoverFeed } = await import("../src/lib/discoverfeed");
    const seed = await buildDiscoverFeed(viewer.id, viewer, { calendarOnly: true, startDay: 0, endDay: 1 });
    for (const coach of extraCoaches) {
      assert.equal(seed.myRail.find(person => person.id === coach.id)?.photo, coach.photoThumb,
        "Every followed coach has their thumbnail before later classes load");
      assert(!seed.items.some(item => item.coachId === coach.id), "Fixture coach has no initial classes");
    }
    assert(!seed.myRail.some(person => person.id === blocked.id), "Blocked identities remain excluded");
    console.log("PASS: all 20 followed faces arrive in the initial two-day seed without classes or original photos");
  } finally {
    await client.close();
    globalThis.__fittlistDb = undefined;
    headers.cookies = originalCookies;
    moduleRuntime._load = originalLoad;
    globalThis.fetch = originalFetch;
  }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
