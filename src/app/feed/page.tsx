import { and, eq, inArray, isNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { fansVisible } from "@/lib/flags";
import { getSessionUserId } from "@/lib/session";
import { logout } from "@/app/actions/auth";
import { clockParts, fmtDayHeader, timeToMinutes } from "@/lib/format";
import { FeedAgenda, type FeedDay } from "@/components/FeedAgenda";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Wordmark";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 14; // two weeks out is plenty for "when can I train next"

// The fan home: one merged agenda across every followed coach, today first.
// Phase 3 adds discovery. Dark until FANS_ENABLED=true.
export default async function FeedPage() {
  if (!(await fansVisible())) redirect("/");
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) redirect("/");

  const followRows = await db
    .select({ trainerUserId: schema.subscribers.trainerUserId })
    .from(schema.subscribers)
    .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt)));
  const trainerIds = followRows.map((r) => r.trainerUserId).filter((id) => id !== userId);
  const coaches = (
    trainerIds.length
      ? await db.select().from(schema.users).where(inArray(schema.users.id, trainerIds))
      : []
  ).filter((c) => !!c.handle);
  coaches.sort((a, b) => a.name.localeCompare(b.name));
  const coachById = new Map(coaches.map((c) => [c.id, c]));

  // Every followed coach's public classes, merged into one forward window.
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
      .filter((c) => (c.specificDate ? c.specificDate === iso : c.dayOfWeek === dow))
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

  return (
    <section className="screen admin" data-mode={me.look === "dark" ? "dark" : undefined}>
      <div className="pad">
        <div className="brandbar feedbar">
          <Wordmark variant="ink" beta />
        </div>
        <div className="feedhead">
          <div className="calbar-title">Your week</div>
          {coaches.length > 0 && (
            <Link className="feedfind" href="/discover">
              <Icon name="search" size={17} /> Find coaches
            </Link>
          )}
        </div>

        {coaches.length === 0 ? (
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
            coaches={coaches.map((c) => ({
              id: c.id,
              handle: c.handle!,
              name: c.name,
              photo: c.photo,
            }))}
            days={days}
          />
        )}

        {/* A coach landing here is previewing the member side — give them the
            way back rather than a log-out they didn't mean to tap. */}
        {me.handle ? (
          <Link className="logoutbtn" href="/app">
            Back to my schedule
          </Link>
        ) : (
          <form action={logout}>
            <button type="submit" className="logoutbtn">
              Log out
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
