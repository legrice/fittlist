"use server";

import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { publicSchedule } from "@/lib/coachweek";
import { runsOn, timeToMinutes, todayIso } from "@/lib/format";
import { weekAsText } from "@/lib/weektext";
import { siteOrigin } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";

// The next seven days as pasteable text.
//
// It used to be computed on the schedule screen, which already held every
// class row. The actions moved onto the profile, which doesn't, so the work
// moved to the server: one action any screen can call, rather than threading
// the whole week through a component that has no other use for it.
//
// Public classes only. A private client session is not for the group chat.
export async function myWeekText(): Promise<{ ok: boolean; text?: string; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Log in first." };
  const db = await getDb();
  const [me] = await db
    .select({
      name: schema.users.name,
      handle: schema.users.handle,
      shiftsPublic: schema.users.shiftsPublic,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me?.handle) return { ok: false, error: "Claim your link first." };

  const rows = (await publicSchedule({ id: userId, shiftsPublic: me.shiftsPublic })).filter(
    (c) => c.isPublic,
  );
  const studioIds = [...new Set(rows.map((c) => c.studioId))].filter((id): id is string => !!id);
  const studios = studioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds))
    : [];
  const studioName = new Map(studios.map((s) => [s.id, s.name]));

  const start = new Date(`${todayIso()}T00:00:00Z`);
  const week = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dow = (d.getUTCDay() + 6) % 7;
    const items = rows
      .filter((c) => runsOn(c, iso, dow))
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
      .map((c) => ({
        name: c.name,
        startTime: c.startTime,
        where: c.studioId ? (studioName.get(c.studioId) ?? null) : c.location,
      }));
    week.push({ iso, items });
  }

  const body = weekAsText(week, `${me.name.trim() || "My"} week on fittlist`);
  if (!body.trim()) return { ok: false, error: "Nothing on the calendar to copy" };
  return { ok: true, text: `${body}\n\n${siteOrigin().replace(/^https?:\/\//, "")}/${me.handle}` };
}
