import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { fansVisible } from "@/lib/flags";
import { hiddenFrom } from "@/lib/blocks";
import { getSessionUserId } from "@/lib/session";
import { runsOn, timeToMinutes, todayIso } from "@/lib/format";
import { DiscoverList, type DiscoverCoach } from "@/components/DiscoverList";
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
  const [allRows, hidden, followRows] = await Promise.all([
    db
      .select()
      .from(schema.users)
      .where(and(isNotNull(schema.users.handle), eq(schema.users.discoverable, true))),
    hiddenFrom(userId),
    db
      .select({ trainerUserId: schema.subscribers.trainerUserId })
      .from(schema.subscribers)
      .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt))),
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
  // Next class time, used to break ties between equally busy coaches.
  const soonest = new Map<string, number>();
  for (const c of classRows) {
    const t = timeToMinutes(c.startTime);
    const cur = soonest.get(c.userId);
    if (cur === undefined || t < cur) soonest.set(c.userId, t);
  }

  const following = new Set(followRows.map((r) => r.trainerUserId));

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
      color: avatarColor(r),
    }))
    .sort(
      (a, b) =>
        (a.kind === "coach" ? 0 : 1) - (b.kind === "coach" ? 0 : 1) ||
        b.classesThisWeek - a.classesThisWeek ||
        (soonest.get(a.id) ?? 1e9) - (soonest.get(b.id) ?? 1e9) ||
        a.name.localeCompare(b.name),
    );

  const cities = [...new Set(coaches.map((c) => c.location).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );

  return (
    <>
      <div className="calbar-title">Discover</div>
      <DiscoverList
        coaches={coaches}
        cities={cities}
        myCity={me.location?.trim() || null}
        backHref="/feed"
        hideBack
      />
    </>
  );
}
