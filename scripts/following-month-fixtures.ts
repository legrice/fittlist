import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { getDb, schema } from "../src/db";
import { todayIso } from "../src/lib/format";

async function main() {
  if (process.env.DATABASE_URL) throw new Error("Month fixtures refuse DATABASE_URL");
  const directory = mkdtempSync(join(tmpdir(), "fittlist-month-audit-"));
  process.env.PGLITE_DATA_DIR = join(directory, "db");
  const secret = randomBytes(32).toString("hex");
  const db = await getDb();
  const iso = todayIso();
  const today = new Date(`${iso}T12:00:00Z`);
  const weekday = (today.getUTCDay() + 6) % 7;
  const plus = (day: string, count: number) => {
    const date = new Date(`${day}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + count);
    return date.toISOString().slice(0, 10);
  };
  const occurrenceInMonth = (offset: number) => {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 8, 12));
    while ((date.getUTCDay() + 6) % 7 !== weekday) date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  };
  const near = occurrenceInMonth(2), far = occurrenceInMonth(8);
  const [viewer, coach, groupOwner] = await db.insert(schema.users).values([
    { email: "month-viewer@example.test", name: "Month Viewer", handle: "monthviewer", kind: "fan", onboardedAt: new Date() },
    { email: "month-coach@example.test", name: "Month Coach", handle: "monthcoach", kind: "coach", discoverable: true, onboardedAt: new Date(), location: "New York" },
    { email: "month-group-owner@example.test", name: "Month Group Owner", handle: "monthgroupowner", kind: "coach", discoverable: true, onboardedAt: new Date() },
  ]).returning();
  await db.insert(schema.subscribers).values({ trainerUserId: coach.id, userId: viewer.id, email: viewer.email });
  const rows = await db.insert(schema.classes).values([
    { userId: coach.id, name: "Month Recurring A", dayOfWeek: weekday, startTime: "23:00", durationMin: 30, isPublic: true },
    { userId: coach.id, name: "Month Recurring B", dayOfWeek: (weekday + 2) % 7, startTime: "18:00", durationMin: 45, isPublic: true },
    { userId: coach.id, name: "Month Dated Near", dayOfWeek: (weekday + 1) % 7, specificDate: plus(near, 1), startTime: "12:00", durationMin: 40, isPublic: true },
    { userId: coach.id, name: "Month Dated Far", dayOfWeek: (weekday + 3) % 7, specificDate: plus(far, 3), startTime: "12:00", durationMin: 40, isPublic: true },
    { userId: groupOwner.id, name: "Month Group Far", dayOfWeek: (weekday + 4) % 7, specificDate: plus(far, 4), startTime: "12:00", durationMin: 40, isPublic: true },
  ]).returning({ id: schema.classes.id, name: schema.classes.name });
  const [group] = await db.insert(schema.groups).values({ name: "Month Group", slug: "month-group", ownerUserId: groupOwner.id, inviteToken: randomBytes(24).toString("hex"), visibility: "public" }).returning();
  await db.insert(schema.groupMembers).values([{ groupId: group.id, userId: groupOwner.id, role: "owner" }, { groupId: group.id, userId: viewer.id, role: "member" }]);
  await db.insert(schema.groupClasses).values({ groupId: group.id, classId: rows[4].id, occurrenceDate: plus(far, 4) });
  const token = await new SignJWT({ uid: viewer.id, sv: 0 }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("12h").sign(new TextEncoder().encode(secret));
  const path = join(directory, "fixtures.json");
  writeFileSync(path, JSON.stringify({ directory, dataDir: process.env.PGLITE_DATA_DIR, secret, iso, viewer: { id: viewer.id, token }, classes: Object.fromEntries(rows.map(row => [row.name, row.id])), dates: { near, nearDated: plus(near, 1), far, farDated: plus(far, 3), groupFar: plus(far, 4), empty: plus(far, 1) } }));
  console.log(path);
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
