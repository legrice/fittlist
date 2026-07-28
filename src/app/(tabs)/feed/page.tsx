import { and, eq, inArray, isNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { fansVisible } from "@/lib/flags";
import { getSessionUserId } from "@/lib/session";
import { clockParts, fmtDayHeader, runsOn, timeToMinutes } from "@/lib/format";
import { FeedAgenda, type FeedDay } from "@/components/FeedAgenda";
import { avatarColor } from "@/lib/avatar";
import { SetPasswordPrompt } from "@/components/SetPasswordPrompt";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 14; // two weeks out is plenty for "when can I train next"

// The fan home: one merged agenda across every followed coach, today first.
// Phase 3 adds discovery. Dark until FANS_ENABLED=true.
export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ setpw?: string }>;
}) {
  if (!(await fansVisible())) redirect("/");
  const { setpw } = await searchParams;
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) redirect("/");
  // A member has a handle too now, so the coach shell keys off `kind`.
  const isCoach = me.kind !== "fan" && !!me.handle;

  const followRows = await db
    .select({ trainerUserId: schema.subscribers.trainerUserId })
    .from(schema.subscribers)
    .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt)));
  const followed = followRows.map((r) => r.trainerUserId).filter((id) => id !== userId);
  // A coach's own week belongs here too — Following answers "when can I train",
  // and what they teach is part of that. They just can't mark themselves going.
  const trainerIds = isCoach ? [...followed, userId] : followed;
  const coaches = (
    trainerIds.length
      ? await db.select().from(schema.users).where(inArray(schema.users.id, trainerIds))
      : []
  ).filter((c) => !!c.handle);
  coaches.sort((a, b) => a.name.localeCompare(b.name));
  const coachById = new Map(coaches.map((c) => [c.id, c]));

  // Their public classes, merged into one forward window. Private sessions stay
  // out of it: this is the member-facing week even when you're looking at your
  // own — the full schedule, private included, is the Schedule tab.
  const classRows = trainerIds.length
    ? (
        await db.select().from(schema.classes).where(inArray(schema.classes.userId, trainerIds))
      ).filter((c) => c.isPublic)
    : [];
  const studioIds = [...new Set(classRows.map((c) => c.studioId))].filter(
    (id): id is string => !!id,
  );
  const studioRows = studioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds))
    : [];
  const studioById = new Map(studioRows.map((s) => [s.id, s]));

  // Classes this member marked "I'm going" to — a personal note, not a booking.
  const goingRows = await db
    .select({
      classId: schema.attendances.classId,
      occurrenceDate: schema.attendances.occurrenceDate,
    })
    .from(schema.attendances)
    .where(eq(schema.attendances.userId, userId));
  const going = new Set(goingRows.map((g) => `${g.classId}|${g.occurrenceDate}`));

  const start = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const days: FeedDay[] = [];
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dow = (d.getUTCDay() + 6) % 7;
    const items = classRows
      .filter((c) => runsOn(c, iso, dow))
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
      .flatMap((c) => {
        const coach = coachById.get(c.userId);
        if (!coach?.handle) return [];
        const s = c.studioId ? studioById.get(c.studioId) : undefined;
        const t = clockParts(c.startTime);
        return [
          {
            classId: c.id,
            coachId: coach.id,
            handle: coach.handle,
            coachName: coach.name,
            coachPhoto: coach.photo,
            coachColor: avatarColor(coach),
            name: c.name,
            hm: t.hm,
            ap: t.ap,
            durationMin: c.durationMin,
            where: s ? s.name : c.location,
            going: going.has(`${c.id}|${iso}`),
          },
        ];
      });
    if (items.length) {
      const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : fmtDayHeader(iso);
      days.push({ iso, label, items });
    }
  }

  // The rail filters the week, so a coach with nothing in it is a chip that
  // can only ever empty the screen. They stay followed — just not on the rail.
  const withClasses = new Set(days.flatMap((d) => d.items.map((i) => i.coachId)));
  const railCoaches = coaches.filter((c) => withClasses.has(c.id));

  return (
    <>
        {/* "Nobody yet" is for an empty tab, not an empty week: someone who
            follows coaches with nothing on gets the agenda's own message. */}
        {railCoaches.length === 0 && followed.length === 0 ? (
          <div className="empty-block">
            <h2>Nobody yet</h2>
            <p>
              Follow a coach and their schedule lands here and in your weekly email. Browse
              who&rsquo;s teaching near you, or open a page you were sent and tap Follow.
            </p>
            <Link className="btn" href="/discover">
              Find coaches
            </Link>
          </div>
        ) : (
          <FeedAgenda
            coaches={railCoaches.map((c) => ({
              id: c.id,
              handle: c.handle!,
              name: c.name,
              photo: c.photo,
              color: avatarColor(c),
            }))}
            days={days}
            meId={userId}
          />
        )}
      {setpw === "1" && !me.passwordHash && <SetPasswordPrompt email={me.email} />}
    </>
  );
}
