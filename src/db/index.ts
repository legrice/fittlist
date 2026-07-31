import * as schema from "./schema";

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
    // Serverless runs this on every cold start, and two instances racing the
    // migrator is how the whole site once went down: the loser threw "already
    // exists" and served that error for the rest of its life. The advisory
    // lock makes the migration single-file across instances; it has to live
    // on one dedicated connection, because the lock is session-scoped.
    const lock = await pool.connect();
    try {
      // Bounded wait: if another instance holds the lock (or froze holding
      // it, which serverless can do), give up rather than hang the site.
      // The rejection clears the memo and the next request retries against
      // a database that is, by then, migrated.
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
    return db as unknown as Db;
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
