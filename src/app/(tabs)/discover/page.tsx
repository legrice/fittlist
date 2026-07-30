import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { fansVisible } from "@/lib/flags";
import { hiddenFrom } from "@/lib/blocks";
import { getSessionUserId } from "@/lib/session";
import { fmtTime, runsOn, todayIso } from "@/lib/format";
import { DiscoverList, type DiscoverCoach, type DiscoverEvent } from "@/components/DiscoverList";
import { avatarColor } from "@/lib/avatar";

export const dynamic = "force-dynamic";

// The directory: every coach with a live page, filterable by city. This is the
// answer to "I just signed up and follow nobody" — and the only screen where a
// fan meets a coach they weren't already handed a link to.
export default async function DiscoverPage() {
  if (!(await fansVisible())) redirect("/");
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) redirect("/");
  // A member has a handle too now, so the coach shell keys off `kind`.
  const isCoach = me.kind !== "fan" && !!me.handle;

  // Blocked in either direction: not on the list. Discover is where someone
  // who was removed would go looking, so it has to be the same nothing the
  // profile is, and it drops the ones you removed too so you aren't handed
  // them back as a suggestion. The three loads only need the viewer, so they
  // run together.
  const [allRows, hidden, followRows, askRows] = await Promise.all([
    db
      .select()
      .from(schema.users)
      .where(and(isNotNull(schema.users.handle), eq(schema.users.discoverable, true))),
    hiddenFrom(userId),
    db
      .select({ trainerUserId: schema.subscribers.trainerUserId })
      .from(schema.subscribers)
      .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt))),
    // Pending asks at gated coaches, so their rows can say Requested rather
    // than offering a Follow that would double-file the ask.
    db
      .select({ trainerUserId: schema.followRequests.trainerUserId })
      .from(schema.followRequests)
      .where(eq(schema.followRequests.requesterUserId, userId)),
  ]);
  const rows = allRows.filter((r) => !hidden.has(r.id));

  const ids = rows.map((r) => r.id);
  const classRows = ids.length
    ? (await db.select().from(schema.classes).where(inArray(schema.classes.userId, ids))).filter(
        (c) => c.isPublic,
      )
    : [];

  // "Classes this week" — the signal that a page is actually live, and the
  // thing a fan is deciding on.
  const start = new Date(`${todayIso()}T00:00:00Z`);
  const weekCount = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dow = (d.getUTCDay() + 6) % 7;
    for (const c of classRows) {
      if (runsOn(c, iso, dow)) {
        weekCount.set(c.userId, (weekCount.get(c.userId) ?? 0) + 1);
      }
    }
  }
  const following = new Set(followRows.map((r) => r.trainerUserId));
  const requested = new Set(askRows.map((r) => r.trainerUserId));
  const joinedAt = new Map(rows.map((r) => [r.id, r.createdAt?.getTime() ?? 0]));

  const coaches: DiscoverCoach[] = rows
    // A coach's page has to be worth opening: a schedule, or enough profile.
    // A member only needs a name; their profile is who they are, and the whole
    // point of listing them is being findable by the people they train with.
    .filter((r) =>
      r.kind === "fan"
        ? !!r.name.trim()
        : r.name.trim() && (weekCount.get(r.id) || r.title?.trim() || r.about?.trim()),
    )
    .filter((r) => r.id !== userId)
    .map((r) => ({
      id: r.id,
      handle: r.handle!,
      name: r.name,
      kind: (r.kind === "fan" ? "member" : "coach") as "coach" | "member",
      photo: r.photo,
      title: r.title ?? "",
      location: r.location?.trim() ?? "",
      classesThisWeek: weekCount.get(r.id) ?? 0,
      following: following.has(r.id),
      requested: requested.has(r.id),
      availability: r.kind === "fan" ? null : r.availability,
      color: avatarColor(r),
    }))
    // Newest people first, coaches and members interleaved: the list doubles
    // as "who just joined", and the fresh face at the top is the reason to
    // keep opening it. The coaches-only switch is the coach view now.
    .sort((a, b) => (joinedAt.get(b.id) ?? 0) - (joinedAt.get(a.id) ?? 0));

  const cities = [...new Set(coaches.map((c) => c.location).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );

  // Events: the one-off dated classes coaches have posted, over the next four
  // weeks. Not a new object, a new lens: these are ordinary public class rows
  // with a specificDate, so Going marks, the class page and the .ics already
  // work on them. The window keeps the list honest; a "calendar" stretching
  // into an empty future is how this feature would read as dead.
  const today = todayIso();
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 28);
  const horizonIso = horizon.toISOString().slice(0, 10);
  const userRowById = new Map(rows.map((r) => [r.id, r]));
  const eventRows = classRows
    .filter((c) => c.specificDate && c.specificDate >= today && c.specificDate <= horizonIso)
    .sort(
      (a, b) =>
        a.specificDate!.localeCompare(b.specificDate!) || a.startTime.localeCompare(b.startTime),
    );
  const eventStudioIds = [...new Set(eventRows.map((c) => c.studioId).filter((x): x is string => !!x))];
  const eventStudios = eventStudioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, eventStudioIds))
    : [];
  const studioNameById = new Map(eventStudios.map((s) => [s.id, s.name]));
  const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dateBits = (isoDay: string) => {
    const d = new Date(`${isoDay}T00:00:00Z`);
    return { wd: WD[(d.getUTCDay() + 6) % 7], mon: MO[d.getUTCMonth()], day: d.getUTCDate() };
  };
  const classEvents: DiscoverEvent[] = eventRows.flatMap((c) => {
    const coach = userRowById.get(c.userId);
    if (!coach?.handle) return [];
    const b = dateBits(c.specificDate!);
    const place = (c.studioId && studioNameById.get(c.studioId)) || c.location || "";
    return [
      {
        id: c.id,
        href: `/${coach.handle}/${c.id}?d=${c.specificDate}&from=discover`,
        name: c.name,
        ...b,
        sub: [`${b.wd} · ${fmtTime(c.startTime)}`, place].filter(Boolean).join(" · "),
        by: `with ${coach.name}`,
        city: coach.location?.trim() ?? "",
        photo: null,
        sort: `${c.specificDate}T${c.startTime}`,
      },
    ];
  });

  // Posted events: the expos, competitions and meetups that aren't anyone's
  // class. A multi-day one keeps listing while it's still running.
  const postedRows2 = await db.select().from(schema.events);
  const posted: DiscoverEvent[] = postedRows2
    .filter((e) => e.endDate >= today && e.startDate <= horizonIso)
    .map((e) => {
      const b = dateBits(e.startDate);
      const multi = e.endDate !== e.startDate;
      const end = dateBits(e.endDate);
      const whenBits = multi
        ? [`${b.wd}, ${b.mon} ${b.day} to ${end.wd}, ${end.mon} ${end.day}`]
        : [b.wd, e.startTime ? fmtTime(e.startTime) : null];
      const poster = e.createdByUserId ? userRowById.get(e.createdByUserId) : undefined;
      const host = e.hostName?.trim() || poster?.name || "";
      return {
        id: e.id,
        href: `/e/${e.id}`,
        name: e.name,
        ...b,
        sub: [...whenBits, e.place].filter(Boolean).join(" · "),
        by: host ? `Hosted by ${host}` : "",
        city: e.city?.trim() ?? "",
        photo: e.photo,
        sort: `${e.startDate}T${e.startTime ?? "00:00"}`,
      };
    });
  const events = [...classEvents, ...posted].sort((a, b) => a.sort.localeCompare(b.sort));

  return (
    <>
      {/* The title lives inside the list now, so the coaches-only switch can
          sit directly across from it. */}
      <DiscoverList
        coaches={coaches}
        events={events}
        cities={cities}
        myCity={me.location?.trim() || null}
        canPost={isCoach}
        backHref="/feed"
        hideBack
      />
    </>
  );
}
