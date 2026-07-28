import { and, eq, inArray, isNull, isNotNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { fansVisible } from "@/lib/flags";
import { getSessionUserId } from "@/lib/session";
import { unreadNotifications } from "@/lib/notify";
import { timeToMinutes } from "@/lib/format";
import { DiscoverList, type DiscoverCoach } from "@/components/DiscoverList";
import { avatarColor } from "@/lib/avatar";
import { AppHeader } from "@/components/AppHeader";
import { NavBar } from "@/components/NavBar";

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

  const unread = await unreadNotifications(userId);
  const rows = await db
    .select()
    .from(schema.users)
    .where(
      and(
        isNotNull(schema.users.handle),
        eq(schema.users.kind, "coach"),
        eq(schema.users.discoverable, true),
      ),
    );

  const ids = rows.map((r) => r.id);
  const classRows = ids.length
    ? (await db.select().from(schema.classes).where(inArray(schema.classes.userId, ids))).filter(
        (c) => c.isPublic,
      )
    : [];

  // "Classes this week" — the signal that a page is actually live, and the
  // thing a fan is deciding on.
  const start = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const weekCount = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dow = (d.getUTCDay() + 6) % 7;
    for (const c of classRows) {
      if (c.specificDate ? c.specificDate === iso : c.dayOfWeek === dow) {
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

  const followRows = await db
    .select({ trainerUserId: schema.subscribers.trainerUserId })
    .from(schema.subscribers)
    .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt)));
  const following = new Set(followRows.map((r) => r.trainerUserId));

  const coaches: DiscoverCoach[] = rows
    // A page nobody can act on isn't worth listing: needs a name, and either a
    // schedule or enough profile to be worth opening.
    .filter((r) => r.name.trim() && (weekCount.get(r.id) || r.title?.trim() || r.about?.trim()))
    .filter((r) => r.id !== userId)
    .map((r) => ({
      id: r.id,
      handle: r.handle!,
      name: r.name,
      photo: r.photo,
      title: r.title ?? "",
      location: r.location?.trim() ?? "",
      classesThisWeek: weekCount.get(r.id) ?? 0,
      following: following.has(r.id),
      color: avatarColor(r),
    }))
    .sort(
      (a, b) =>
        b.classesThisWeek - a.classesThisWeek ||
        (soonest.get(a.id) ?? 1e9) - (soonest.get(b.id) ?? 1e9) ||
        a.name.localeCompare(b.name),
    );

  const cities = [...new Set(coaches.map((c) => c.location).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );

  return (
    <section
      className={`screen${me.handle ? " hasnav" : ""}`}
      data-mode={me.look === "dark" ? "dark" : undefined}
    >
      <div className="pad">
        <AppHeader unread={unread} />
        <div className="calbar-title">Discover</div>
        <DiscoverList coaches={coaches} cities={cities} backHref="/feed" hideBack={!!me.handle} />
      </div>
      {me.handle && <NavBar active="discover" photo={me.photo} color={avatarColor(me)} initial={(me.name.trim().charAt(0) || "?").toUpperCase()} />}
    </section>
  );
}
