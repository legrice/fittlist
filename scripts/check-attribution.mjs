// Post-smoke check: reads the dev PGlite database directly (run AFTER the
// server is stopped - PGlite is single-process) and verifies footer signup
// attribution landed in users.signup_source.
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite(".data/pglite");
const r = await db.query(
  "select handle, signup_source from users order by created_at",
);
console.log(r.rows);
const sam = r.rows.find((u) => u.handle === "sam");
if (!sam) throw new Error("sam not found");
if (sam.signup_source !== "footer:matt")
  throw new Error("expected footer:matt, got " + sam.signup_source);
const matt = r.rows.find((u) => u.handle === "matt");
if (matt.signup_source !== null) throw new Error("matt should have no signup source");
console.log("ATTRIBUTION OK");
await db.close();
