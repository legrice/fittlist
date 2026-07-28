"use server";

import { isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db";

// Every location already in use, canonical and deduped. Offered as suggestions
// so people join the city that exists rather than spelling a second one, and
// used on save to snap a bare city onto its only match.
export async function knownLocations(): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ location: schema.users.location })
    .from(schema.users)
    .where(isNotNull(schema.users.location));
  return [...new Set(rows.map((r) => r.location!).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}
