import { and, eq, gte, inArray, isNull, ne } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { hiddenFrom } from "@/lib/blocks";
import { fansVisible } from "@/lib/flags";
import { fmtTime, todayIso } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { posterTint } from "@/lib/tint";
import { myWeek } from "@/lib/week";
import { Icon } from "@/components/Icon";
import { PlansShelf, type PlanChip } from "@/components/PlansShelf";

export const dynamic = "force-dynamic";

// Home is the doors, not the room. Every section here is an entry point:
// your plans, the week behind its own door, the coaches you already train
// with, what's coming up on the board, and who's around you. The long lists
// all live one tap away, where they can be long.
export default async function HomePage() {
  if (!(await fansVisible())) redirect("/");
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) redirect("/");

  const [followRows, hidden] = await Promise.all([
    db
      .select({ trainerUserId: schema.subscribers.trainerUserId })
      .from(schema.subscribers)
      .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt))),
    hiddenFrom(userId),
  ]);
  const followedIds = followRows
    .map((r) => r.trainerUserId)
    .filter((id) => id !== userId && !hidden.has(id));
  const followedSet = new Set(followedIds);

  // The faces you already train with. Following them doesn't hide them: home
  // is where you'd go looking for a person, and these are your people.
  const followedUsers = followedIds.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, followedIds))
    : [];
  const myCoaches = followedUsers
    .filter((u) => u.kind !== "fan" && !!u.handle)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Your plans: everything hearted that's still ahead, classes and events.
  const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const chipWhen = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return `${WD[(d.getUTCDay() + 6) % 7]} · ${MO[d.getUTCMonth()]} ${d.getUTCDate()}`;
  };
  const week = await myWeek(userId);
  const plans: PlanChip[] = week
    .flatMap((d) => [
      ...d.items
        .filter((i) => !i.personal)
        .map((i) => ({
          key: `c|${i.classId}|${i.iso}`,
          kind: "class" as const,
          when: chipWhen(i.iso),
          name: i.name,
          sub: `${i.hm}${i.ap}${i.coachName.trim() ? ` · ${i.coachName}` : ""}`,
          iso: i.iso,
          handle: i.handle,
          classId: i.classId,
        })),
      ...(d.events ?? []).map((e) => ({
        key: `e|${e.eventId}`,
        kind: "event" as const,
        when: chipWhen(d.iso),
        name: e.name,
        sub: e.timeLabel ? `${e.timeLabel} · ${e.place}` : e.place,
        iso: d.iso,
        eventId: e.eventId,
      })),
    ])
    .slice(0, 10);

  // What's coming up on the board, soonest first, as small posters.
  const upcoming = (
    await db
      .select()
      .from(schema.events)
      .where(gte(schema.events.endDate, todayIso()))
  )
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 4);
  const evWhen = (ev: (typeof upcoming)[number]) => {
    const d = new Date(`${ev.startDate}T00:00:00Z`);
    const day = `${WD[(d.getUTCDay() + 6) % 7]} · ${MO[d.getUTCMonth()]} ${d.getUTCDate()}`;
    return ev.startTime ? `${day} · ${fmtTime(ev.startTime)}` : day;
  };

  // Coaches near you: same city, not you, not already followed.
  const nearby = me.location
    ? (
        await db
          .select()
          .from(schema.users)
          .where(and(eq(schema.users.location, me.location), ne(schema.users.kind, "fan")))
      )
        .filter((u) => u.id !== userId && !!u.handle && !followedSet.has(u.id) && !hidden.has(u.id))
        .slice(0, 6)
    : [];

  const face = (photo: string | null, name: string, color: string) =>
    photo ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="nearbyc-av" src={photo} alt="" />
    ) : (
      <span className="nearbyc-av nearbyc-av-empty" style={{ background: color }} aria-hidden="true">
        {(name.trim().charAt(0) || "?").toUpperCase()}
      </span>
    );

  return (
    <>
      {plans.length > 0 ? (
        <PlansShelf items={plans} />
      ) : (
        <div className="plans">
          <h2 className="plans-h">Your plans</h2>
          <p className="homehint">Nothing planned yet. Heart a class and it lands here.</p>
        </div>
      )}

      {/* The door to the room: the merged week lives on its own tab. */}
      <Link className="homedoor" href="/feed">
        <span className="homedoor-txt">
          <span className="t">This week</span>
          <span className="s">Every class from your coaches, day by day</span>
        </span>
        <Icon name="chevron_right" size={20} />
      </Link>

      {myCoaches.length > 0 && (
        <div className="nearby">
          <h2 className="plans-h nearby-h">
            Your coaches
            <Link className="nearby-all" href="/discover">
              Find more
            </Link>
          </h2>
          <div className="nearby-row">
            {myCoaches.map((u) => (
              <Link key={u.id} className="nearbyc" href={`/${u.handle}?from=home`}>
                {face(u.photo, u.name, avatarColor(u))}
                <span className="nearbyc-nm">{u.name.trim() || u.email.split("@")[0]}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="nearby">
          <h2 className="plans-h nearby-h">
            Events coming up
            <Link className="nearby-all" href="/discover">
              See all
            </Link>
          </h2>
          <div className="homeevs">
            {upcoming.map((ev) => (
              <Link
                key={ev.id}
                className="disposter disposter-mini"
                href={`/e/${ev.id}`}
                style={ev.photo ? undefined : { background: posterTint(ev.id) }}
              >
                {ev.photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="disposter-mini-img" src={ev.photo} alt="" aria-hidden="true" />
                )}
                <span className="disposter-nm">{ev.name}</span>
                <span className="disposter-sub">{evWhen(ev)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {nearby.length > 0 && (
        <div className="nearby">
          <h2 className="plans-h nearby-h">
            Coaches near you
            <Link className="nearby-all" href="/discover">
              See all
            </Link>
          </h2>
          <div className="nearby-row">
            {nearby.map((u) => (
              <Link key={u.id} className="nearbyc" href={`/${u.handle}?from=home`}>
                {face(u.photo, u.name, avatarColor(u))}
                <span className="nearbyc-nm">{u.name.trim() || u.email.split("@")[0]}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
