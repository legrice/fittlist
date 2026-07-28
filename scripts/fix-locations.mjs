// One-off: rewrite existing users.location into the canonical "City, ST".
//
// Discover groups by the exact string, so rows written before normalization
// existed still show up as separate chips. Run once after deploying it:
//
//   npx tsx scripts/fix-locations.mjs          # against .data/pglite
//   DATABASE_URL=... npx tsx scripts/fix-locations.mjs
//
// Prints what it would change, then does it. Rows it can't parse (a city with
// no state) are listed and left alone, since guessing the state is exactly the
// thing that makes them ambiguous.
import { getDb, schema } from "../src/db/index.ts";
import { normalizeLocation } from "../src/lib/location.ts";
import { eq, isNotNull } from "drizzle-orm";

const db = await getDb();
const rows = await db
  .select({ id: schema.users.id, email: schema.users.email, location: schema.users.location })
  .from(schema.users)
  .where(isNotNull(schema.users.location));

let changed = 0;
const stuck = [];
for (const r of rows) {
  const res = normalizeLocation(r.location);
  if (!res.ok) {
    stuck.push(`${r.email}: "${r.location}" (no state, left as is)`);
    continue;
  }
  if (res.value === r.location) continue;
  console.log(`  "${r.location}"  ->  "${res.value}"`);
  await db.update(schema.users).set({ location: res.value }).where(eq(schema.users.id, r.id));
  changed++;
}
console.log(`\n${changed} rewritten, ${rows.length - changed - stuck.length} already canonical`);
if (stuck.length) {
  console.log(`\n${stuck.length} need a state adding by hand:`);
  for (const s of stuck) console.log("  " + s);
}
process.exit(0);
