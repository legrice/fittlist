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

async function main() {
  if (process.env.DATABASE_URL || process.env.VERCEL) throw new Error("Saved visibility check is isolated/local only");
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  globalThis.fetch = async () => { throw new Error("External network disabled in saved visibility check"); };
  const request = new AsyncLocalStorage<string | null>();
  const require = createRequire(import.meta.url);
  const moduleRuntime = require("node:module");
  const originalLoad = moduleRuntime._load.bind(moduleRuntime);
  moduleRuntime._load = (specifier: string, ...args: unknown[]) => specifier === "server-only" ? {} : originalLoad(specifier, ...args);
  require("next/headers").cookies = async () => ({ get: (name: string) => name === "fl_session" && request.getStore() ? { value: request.getStore() } : undefined });
  const client = new PGlite();
  const db = drizzle(client, { schema });
  globalThis.__fittlistDb = Promise.resolve(db);
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    const { myWeek, sharedWeek, memberWeek } = await import("../src/lib/week");
    const { shareWeek } = await import("../src/lib/shareweek");
    const { personPeek } = await import("../src/app/actions/peek");
    const { todayIso, dowOfDate } = await import("../src/lib/format");
    const today = todayIso();
    const date = new Date(Date.parse(`${today}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
    const nextDate = new Date(Date.parse(`${date}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
    const dow = dowOfDate(date);
    const [teacher, owner, friend] = await db.insert(schema.users).values([
      { email: "visibility-teacher@example.test", name: "Teacher", handle: "visibilityteacher", kind: "coach" },
      { email: "visibility-owner@example.test", name: "Owner", handle: "visibilityowner", kind: "fan", approveFollowers: true },
      { email: "visibility-friend@example.test", name: "Friend", handle: "visibilityfriend", kind: "fan" },
    ]).returning();
    const [studio] = await db.insert(schema.studios).values({ name: "Audit studio", slug: "visibility-studio", address: "1 Test Street" }).returning();
    const classes = await db.insert(schema.classes).values([
      { name: "Public save" },
      { name: "Private save" },
      { name: "Source is private", isPublic: false },
      { name: "Canceled occurrence", skipDates: [date] },
      { name: "Ended recurrence", endsOn: today },
      { name: "Moved one-off", specificDate: nextDate },
      { name: "Wrong weekday", dayOfWeek: (dow + 1) % 7 },
    ].map((overrides) => ({ userId: teacher.id, studioId: studio.id, startTime: "12:00", durationMin: 50, dayOfWeek: dow, ...overrides }))).returning();
    await db.insert(schema.attendances).values(classes.map((row) => ({ userId: owner.id, classId: row.id, occurrenceDate: date, isPublic: row.name !== "Private save" })));
    const [personal] = await db.insert(schema.personalClasses).values({ userId: owner.id, name: "My own plan", dayOfWeek: dow, specificDate: date, startTime: "15:00", durationMin: 30 }).returning();
    await db.insert(schema.subscribers).values([
      { trainerUserId: owner.id, userId: friend.id, email: friend.email },
      { trainerUserId: friend.id, userId: owner.id, email: owner.email },
    ]);
    await db.insert(schema.attendances).values({ userId: friend.id, classId: classes[0].id, occurrenceDate: date, isPublic: false });
    const tokens = new Map<string, string>();
    for (const user of [teacher, owner, friend]) tokens.set(user.id, await new SignJWT({ uid: user.id, sv: 0 }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.SESSION_SECRET)));
    const as = <T>(id: string, work: () => Promise<T>) => request.run(tokens.get(id)!, work);
    const names = (days: { items: { name: string }[] }[]) => days.flatMap((day) => day.items.map((item) => item.name)).sort();
    const owned = ["My own plan", "Private save", "Public save"].sort();
    const visible = ["My own plan", "Public save"].sort();

    const ownWeek = await myWeek(owner.id, { email: owner.email });
    assert.deepEqual(names(ownWeek), owned, "Owner calendar must preserve own hidden marks/personal plans but exclude invalid/private source occurrences");
    const saved = ownWeek.flatMap((day) => day.items).find((item) => item.classId === classes[0].id)!;
    assert.equal(saved.alsoGoing?.length ?? 0, 0, "Private attendance must not leak through also-going mutuals");
    assert(ownWeek.flatMap((day) => day.items).some((item) => item.id === personal.id && item.personal));
    console.log("PASS: own calendar validates source visibility/recurrence and preserves owner private choices");

    assert.deepEqual(names(await sharedWeek(owner.id)), visible, "Shared profile must not expose a private attendance");
    assert.deepEqual(names(await memberWeek(owner.id)), visible);
    assert.deepEqual(names(await memberWeek(owner.id, { includePrivateSaved: true })), owned, "Owner profile must retain its own private attendance");
    console.log("PASS: shared/member profile hides private saves while explicit owner view retains them");

    const peek = await as(friend.id, () => personPeek(owner.id));
    assert(peek);
    assert.deepEqual(names(peek.days), ["Public save"], "Other-viewer peek excludes private, canceled, ended and moved occurrences");
    const ownPeek = await as(owner.id, () => personPeek(owner.id));
    assert(ownPeek);
    assert.deepEqual(names(ownPeek.days), ["Private save", "Public save"].sort());
    console.log("PASS: peek applies saved visibility and occurrence checks to actual loader output");

    assert.deepEqual(names(await shareWeek(owner.id, date, 1)), owned, "Explicit owner share picker preserves hidden saves but rejects invalid source occurrences");
    await db.update(schema.users).set({ kind: "coach" }).where(eq(schema.users.id, owner.id));
    assert.deepEqual(names(await shareWeek(owner.id, date, 1)), owned, "Coach share branch applies the same source checks");
    console.log("PASS: both fan and coach share loaders reject ghost occurrences");

    await db.update(schema.attendances).set({ isPublic: true }).where(and(eq(schema.attendances.userId, friend.id), eq(schema.attendances.classId, classes[0].id)));
    const publicFriend = (await myWeek(owner.id, { email: owner.email })).flatMap((day) => day.items).find((item) => item.classId === classes[0].id)!;
    assert.equal(publicFriend.alsoGoing?.[0]?.name, "Friend");
    console.log("PASS: public mutual attendance still appears in also-going");
  } finally {
    await client.close();
    globalThis.__fittlistDb = undefined;
    moduleRuntime._load = originalLoad;
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
