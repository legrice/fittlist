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
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
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
  if (!globalThis.__fittlistDb) globalThis.__fittlistDb = init();
  return globalThis.__fittlistDb;
}

export { schema };
