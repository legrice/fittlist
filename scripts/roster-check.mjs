// The roster's data model, checked without a browser.
//
// The claim being tested is the one everything else on the staff side rests
// on: a position can hold shifts before the person is on fittlist, and when
// they arrive nothing is re-entered. If this is wrong, every screen built on
// top of it is wrong in a way screenshots would not show.
//
//   rm -rf .data/pglite && npx tsx scripts/roster-check.mjs
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../src/db/index.ts";
import {
  PLACEHOLDER_KIND,
  createPlaceholderCoach,
  mergePlaceholderInto,
} from "../src/lib/roster.ts";

const fail = (m) => {
  console.error("ROSTER FAIL: " + m);
  process.exit(1);
};

const db = await getDb();

// a studio, and a gym account to own its classes the way a real rota does
const [studio] = await db
  .insert(schema.studios)
  .values({ name: "Ironbound Performance", address: "1 Way, Newark NJ", slug: "roster-check-studio", seq: 99001 })
  .returning();
const [gym] = await db
  .insert(schema.users)
  .values({
    kind: "gym",
    email: `studio.${studio.id}@gym.fittlist.invalid`,
    name: studio.name,
    handle: null,
    discoverable: false,
  })
  .returning();
await db.update(schema.studios).set({ accountUserId: gym.id }).where(eq(schema.studios.id, studio.id));

// A manager writes next week down before Rob has ever heard of fittlist.
const { userId: rob } = await createPlaceholderCoach({
  studioId: studio.id,
  name: "Rob Jimenez",
  email: "rob@example.com",
});
const [phRow] = await db.select().from(schema.users).where(eq(schema.users.id, rob));
if (phRow.kind !== PLACEHOLDER_KIND) fail("a placeholder should be its own kind");
if (phRow.handle) fail("a placeholder must have no handle, or it reaches Discover");
if (phRow.discoverable) fail("a placeholder must not be discoverable");
if (!phRow.email.endsWith(".invalid")) fail("a placeholder's address must be unreachable");
console.log("placeholder ok (a users row nobody can sign into)");

// It holds shifts: the standing slot, and a one-off cover over it.
const [slot] = await db
  .insert(schema.classes)
  .values({
    userId: gym.id,
    coachUserId: rob,
    name: "Sunrise Conditioning",
    dayOfWeek: 1,
    startTime: "05:30",
    durationMin: 45,
    studioId: studio.id,
    isPublic: true,
  })
  .returning();
await db.insert(schema.shiftCovers).values({
  classId: slot.id,
  occurrenceDate: "2026-08-11",
  coachUserId: rob,
  createdByUserId: rob,
});
console.log("position holds shifts ok (a slot and a cover, before any account)");

// Rob signs up. The real account is a normal coach with a handle.
const [realRob] = await db
  .insert(schema.users)
  .values({ kind: "coach", email: "rob@example.com", name: "Rob Jimenez", handle: "rob" })
  .returning();

const res = await mergePlaceholderInto(rob, realRob.id);
if (!res.ok) fail("the merge refused: " + res.error);

const [slotAfter] = await db.select().from(schema.classes).where(eq(schema.classes.id, slot.id));
if (slotAfter.coachUserId !== realRob.id) fail("the slot did not move onto the real account");
const [coverAfter] = await db
  .select()
  .from(schema.shiftCovers)
  .where(eq(schema.shiftCovers.classId, slot.id));
if (coverAfter.coachUserId !== realRob.id) fail("the cover did not move");
if (coverAfter.createdByUserId !== realRob.id) fail("who wrote the cover down was orphaned");
const [rota] = await db
  .select()
  .from(schema.studioRotaCoaches)
  .where(
    and(
      eq(schema.studioRotaCoaches.studioId, studio.id),
      eq(schema.studioRotaCoaches.userId, realRob.id),
    ),
  );
if (!rota) fail("the roster entry did not move onto the real account");
if (rota.state !== "active") fail("an accepted entry should be active, got " + rota.state);
if (!rota.acceptedAt) fail("an accepted entry should record when");
if (rota.invitedEmail) fail("the invite address should clear once they are on");
const [gone] = await db.select().from(schema.users).where(eq(schema.users.id, rob));
if (gone) fail("the placeholder should be gone once merged");
console.log("merge ok (shifts, covers and the roster row move; nothing re-entered)");

// A second merge onto somebody already on this rota keeps one row, not two.
const { userId: ph2 } = await createPlaceholderCoach({ studioId: studio.id, name: "Rob J" });
const res2 = await mergePlaceholderInto(ph2, realRob.id);
if (!res2.ok) fail("the second merge refused: " + res2.error);
const rows = await db
  .select()
  .from(schema.studioRotaCoaches)
  .where(
    and(
      eq(schema.studioRotaCoaches.studioId, studio.id),
      eq(schema.studioRotaCoaches.userId, realRob.id),
    ),
  );
if (rows.length !== 1) fail(`one person, one roster row: got ${rows.length}`);
console.log("duplicate merge ok (one person, one row on a rota)");

// A real account is not something this can swallow.
const bad = await mergePlaceholderInto(realRob.id, gym.id);
if (bad.ok) fail("merging a real account away should be refused");
console.log("refuses a real account ok");

console.log("ROSTER CHECKS PASSED");
process.exit(0);
