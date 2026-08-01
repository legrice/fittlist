import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { publicSchedules } from "@/lib/coachweek";
import { fansVisible } from "@/lib/flags";
import { hiddenFrom } from "@/lib/blocks";
import { getSessionUserId } from "@/lib/session";
import { runsOn, todayIso } from "@/lib/format";
import { DiscoverList, type DiscoverCoach, type DiscoverStudio } from "@/components/DiscoverList";
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

  // Their own classes plus the shifts each has chosen to show, so the count
  // below matches what opening their page actually shows.
  const classRows = (await publicSchedules(rows)).filter((c) => c.isPublic);

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
        weekCount.set(c.ownerUserId, (weekCount.get(c.ownerUserId) ?? 0) + 1);
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

  // The other half of the directory. Every studio, in name order: a row here
  // is a place, and a place doesn't get ranked by whether it signed up. The
  // tag says which of them you can see a week for, which is the useful part.
  const studioRows = await db.select().from(schema.studios).orderBy(schema.studios.name);
  const studios: DiscoverStudio[] = studioRows.map((st) => ({
    id: st.id,
    slug: st.slug ?? st.id,
    name: st.name,
    address: st.address,
    photo: st.photo,
    types: st.types,
    hasSchedule: !!st.accountUserId,
  }));

  return (
    <>
      {/* The title lives inside the list now, so the coaches-only switch can
          sit directly across from it. */}
      <DiscoverList
        coaches={coaches}
        studios={studios}
        cities={cities}
        myCity={me.location?.trim() || null}
        backHref="/feed"
        hideBack
      />
    </>
  );
}
