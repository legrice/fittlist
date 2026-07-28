import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";

// Which look a *public* page renders in. Dark mode is the viewer's preference,
// not the page owner's: if you've chosen dark, every coach's page you open is
// dark too. A logged-out visitor has no preference, so they get light.
//
// The owner's own `look` still themes their app, and still themes their page
// for them — because when they're viewing it, they're the viewer.
export async function viewerLook(): Promise<"dark" | undefined> {
  const userId = await getSessionUserId();
  if (!userId) return undefined;
  const db = await getDb();
  const [u] = await db
    .select({ look: schema.users.look })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return u?.look === "dark" ? "dark" : undefined;
}
