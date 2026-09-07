import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { SignJWT } from "jose";
import * as schema from "../src/db/schema";

async function main() {
  if (process.env.DATABASE_URL || process.env.VERCEL) throw new Error("Notification audit fixtures are isolated/local only");
  const directory = mkdtempSync(join(tmpdir(), "fittlist-notifications-"));
  const dataDir = join(directory, "db");
  const secret = randomBytes(32).toString("hex");
  const client = new PGlite(dataDir);
  try {
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
    const [viewer, other] = await db.insert(schema.users).values([
      { email: "notifications-a@example.test", name: "Notification Viewer", handle: "notifications-a", kind: "fan", onboardedAt: new Date(), feedbackPromptedAt: new Date(), invitesBannerAt: new Date() },
      { email: "notifications-b@example.test", name: "Other Viewer", handle: "notifications-b", kind: "fan", onboardedAt: new Date(), feedbackPromptedAt: new Date(), invitesBannerAt: new Date() },
    ]).returning();
    const base = Date.now() - 3600000;
    const titles = Array.from({ length: 57 }, (_, index) => `Notification ${String(index + 1).padStart(3, "0")}`);
    await db.insert(schema.notifications).values(titles.map((title, index) => ({ userId: viewer.id, title, type: "follow", createdAt: new Date(base + index * 1000) })));
    await db.insert(schema.notifications).values([
      { userId: viewer.id, title: "Hidden message event", type: "message" },
      { userId: viewer.id, title: "Hidden feedback event", type: "feedback" },
      ...Array.from({ length: 3 }, (_, index) => ({ userId: other.id, title: `Other viewer ${index + 1}`, type: "follow", createdAt: new Date(base + index * 1000) })),
    ]);
    const token = (id: string) => new SignJWT({ uid: id, sv: 0 }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode(secret));
    const fixture = { directory, dataDir, secret, titles: titles.reverse(), viewer: { id: viewer.id, token: await token(viewer.id) }, other: { id: other.id, token: await token(other.id) } };
    const file = join(directory, "fixtures.json");
    writeFileSync(file, JSON.stringify(fixture), { mode: 0o600 });
    console.log(file);
  } finally { await client.close(); }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
