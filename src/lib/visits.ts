import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { mondayOfCurrentWeek } from "@/lib/format";

// Daily rollup per trainer (page_visits). The week runs Mon–Sun in UTC,
// matching the product's week.

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
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

export async function recordScheduleOpen(trainerUserId: string): Promise<void> {
  const db = await getDb();
  await db
    .insert(schema.pageVisits)
    .values({ trainerUserId, date: isoDate(new Date()), count: 0, scheduleOpens: 1 })
    .onConflictDoUpdate({
      target: [schema.pageVisits.trainerUserId, schema.pageVisits.date],
      set: { scheduleOpens: sql`${schema.pageVisits.scheduleOpens} + 1` },
    });
}

// All-time totals for the coach's analytics.
export async function coachAnalytics(
  trainerUserId: string,
): Promise<{ profileViews: number; scheduleOpens: number }> {
  const db = await getDb();
  const [row] = await db
    .select({
      views: sql<number>`coalesce(sum(${schema.pageVisits.count}), 0)::int`,
      opens: sql<number>`coalesce(sum(${schema.pageVisits.scheduleOpens}), 0)::int`,
    })
    .from(schema.pageVisits)
    .where(eq(schema.pageVisits.trainerUserId, trainerUserId));
  return { profileViews: row?.views ?? 0, scheduleOpens: row?.opens ?? 0 };
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
