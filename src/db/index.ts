import * as schema from "./schema";
import journal from "../../drizzle/meta/_journal.json";

// One DB module for both environments:
//  - DATABASE_URL set  -> node-postgres pool (production)
//  - DATABASE_URL unset -> embedded PGlite persisted at .data/pglite (dev/test)
// Migrations run lazily on first use so `next dev` needs zero setup.

type Db = ReturnType<typeof import("drizzle-orm/pglite").drizzle<typeof schema>>;

declare global {
  // eslint-disable-next-line no-var
  var __fittlistDb: Promise<Db> | undefined;
}

async function init(): Promise<Db> {
  if (process.env.DATABASE_URL) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Fail fast instead of waiting forever: a database over its plan
      // limits (or briefly suspended) used to leave every request hanging on
      // connect, which reads as the site never loading. A rejection here
      // clears the getDb memo, so the next request simply tries again.
      connectionTimeoutMillis: 10_000,
    });
    const db = drizzle(pool, { schema });
    // The migrator stays off the hot path. Almost every cold start finds the
    // database already at the newest migration, and for those one cheap
    // SELECT is the whole ceremony: no advisory lock to contend on, nothing
    // that can wedge the site. Only a database that is actually behind takes
    // the lock, and even then every wait is bounded, because a frozen
    // serverless instance holding an unbounded lock took the site down once.
    const latest = journal.entries[journal.entries.length - 1].when;
    let behind = true;
    try {
      const r = await pool.query(
        'select created_at from "drizzle"."__drizzle_migrations" order by created_at desc limit 1',
      );
      behind = r.rows.length === 0 || Number(r.rows[0].created_at) < latest;
    } catch {
      // No migrations table yet: a fresh database, which is as behind as it gets.
    }
    if (behind) {
      const lock = await pool.connect();
      try {
        await lock.query("set lock_timeout = '15s'");
        await lock.query("select pg_advisory_lock(872619)");
        await migrate(db, { migrationsFolder: "./drizzle" });
      } finally {
        try {
          await lock.query("select pg_advisory_unlock(872619)");
        } catch {
          // The session dying releases the lock anyway.
        } finally {
          lock.release();
        }
      }
    }
    return db as unknown as Db;
  }
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_EMBEDDED_DB_IN_PRODUCTION !== "true") {
    throw new Error(
      "DATABASE_URL is not set; refusing to use the embedded development database in production",
    );
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const { mkdirSync } = await import("fs");
  mkdirSync(".data/pglite", { recursive: true });
  const client = new PGlite(".data/pglite");
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

export function getDb(): Promise<Db> {
  if (!globalThis.__fittlistDb) {
    // A failed init must not become the instance's last word. Clear the memo
    // on rejection so the next request tries again, instead of every request
    // replaying one bad cold start until the process dies.
    globalThis.__fittlistDb = init().catch((err) => {
      globalThis.__fittlistDb = undefined;
      throw err;
    });
  }
  return globalThis.__fittlistDb;
}

export { schema };
