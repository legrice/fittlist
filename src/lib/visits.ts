import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

// Daily rollup per trainer (page_visits). The week runs Mon–Sun in UTC,
// matching the product's week.

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function mondayOfCurrentWeek(now = new Date()): string {
  const day = (now.getUTCDay() + 6) % 7; // 0 = Monday
  const m = new Date(now);
  m.setUTCDate(now.getUTCDate() - day);
  return isoDate(m);
}

const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|curl|wget/i;

export function looksLikeBot(userAgent: string | null): boolean {
  return !userAgent || BOT_UA.test(userAgent);
}

export async function recordVisit(trainerUserId: string): Promise<void> {
  const db = await getDb();
  await db
    .insert(schema.pageVisits)
    .values({ trainerUserId, date: isoDate(new Date()), count: 1 })
    .onConflictDoUpdate({
      target: [schema.pageVisits.trainerUserId, schema.pageVisits.date],
      set: { count: sql`${schema.pageVisits.count} + 1` },
    });
}

export async function visitsThisWeek(trainerUserId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${schema.pageVisits.count}), 0)::int` })
    .from(schema.pageVisits)
    .where(
      and(
        eq(schema.pageVisits.trainerUserId, trainerUserId),
        gte(schema.pageVisits.date, mondayOfCurrentWeek()),
      ),
    );
  return row.n;
}
