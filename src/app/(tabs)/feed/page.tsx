import { and, eq, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { hiddenFrom } from "@/lib/blocks";
import { classAddress, publicSchedules } from "@/lib/coachweek";
import { clockParts, occurrenceEnded, runsOn, timeToMinutes, todayIso, WEEKS_AHEAD, weekDates } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { FollowingScreen, type FeedCoach, type FeedItem } from "@/components/FollowingScreen";

export const dynamic = "force-dynamic";

/**
 * Following: the merged week of everyone you follow.
 *
 * This is the only screen a member has, and it is what a follow buys. It was
 * deleted for a build while following delivered a face and a peek instead of a
 * week, on the bet that saving would be the act worth measuring; the bet was
 * dropped with a member's calendar, because there is nothing to save to now.
 * A follow means their week joins yours to read. That is the whole
 * relationship, and it is enough.
 *
 * The three weeks load at once and the client flips between them. It is 21
 * days of one query rather than a round trip per arrow tap, and an arrow that
 * waits on a server is an arrow nobody presses twice.
 */
export default async function FollowingPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) redirect("/");

  // By email, the way every other follow lookup does it: somebody who followed
  // before signing in still counts once the address has an account.
  const [followRows, hidden] = await Promise.all([
    db
      .select({ trainerUserId: schema.subscribers.trainerUserId })
      .from(schema.subscribers)
      .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt))),
    hiddenFrom(userId),
  ]);
  const followed = followRows
    .map((r) => r.trainerUserId)
    .filter((id) => id !== userId && !hidden.has(id));
  // A coach's own week belongs here too. Following answers "when can I train",
  // and what they teach is part of that.
  const isCoach = me.kind !== "fan" && !!me.handle;
  const trainerIds = [...new Set(isCoach ? [...followed, userId] : followed)];

  const coachRows = trainerIds.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, trainerIds))
    : [];
  // The same loader the coach's own page and the digests ask, so following
  // somebody shows the week their page shows and not a shorter one.
  const allClassRows = trainerIds.length ? await publicSchedules(coachRows) : [];
  const classRows = allClassRows.filter((c) => c.isPublic);
  const coaches = coachRows.filter((c) => !!c.handle);
  const coachById = new Map(coaches.map((c) => [c.id, c]));

  const studioIds = [...new Set(classRows.map((c) => c.studioId))].filter(
    (id): id is string => !!id,
  );
  const studioRows = studioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds))
    : [];
  const studioById = new Map(studioRows.map((s) => [s.id, s]));

  const today = todayIso();
  const items: FeedItem[] = [];
  for (let w = 0; w <= WEEKS_AHEAD; w++) {
    for (const iso of weekDates(w, today)) {
      const d = new Date(`${iso}T00:00:00Z`);
      const dow = (d.getUTCDay() + 6) % 7;
      for (const c of classRows) {
        if (!runsOn(c, iso, dow)) continue;
        // Been and gone is not an answer to "when can I train next".
        if (occurrenceEnded(iso, c.startTime, c.durationMin)) continue;
        // A shift is owned by the gym and shown under the coach, so the person
        // this row is about is ownerUserId, never userId.
        const coach = coachById.get(c.ownerUserId);
        if (!coach?.handle) continue;
        const st = c.studioId ? studioById.get(c.studioId) : undefined;
        const at = classAddress(c, coach.handle, st?.slug);
        if (!at) continue;
        const t = clockParts(c.startTime);
        items.push({
          key: `${c.id}|${iso}`,
          week: w,
          iso,
          classId: c.id,
          base: at.key,
          coachId: coach.id,
          name: c.name,
          where: st?.name ?? c.location ?? null,
          // A studio has a page; a class's own free-text location names a
          // room, which has nothing to open.
          whereHref: st ? `/s/${st.slug}` : null,
          hm: t.hm,
          ap: t.ap,
          mins: timeToMinutes(c.startTime),
        });
      }
    }
  }

  const rail: FeedCoach[] = coaches
    .map((c) => ({
      id: c.id,
      name: c.name.trim() || c.email.split("@")[0],
      handle: c.handle!,
      photo: c.photo,
      color: avatarColor(c),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return <FollowingScreen items={items} coaches={rail} todayIso={today} />;
}
