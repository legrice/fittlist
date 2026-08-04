import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { publicSchedules } from "@/lib/coachweek";
import { fansVisible } from "@/lib/flags";
import { hiddenFrom } from "@/lib/blocks";
import { getSessionUserId } from "@/lib/session";
import { runsOn, todayIso } from "@/lib/format";
import { DiscoverList, type DiscoverHalf } from "@/components/DiscoverList";
import type { DirPerson, DirStudio } from "@/components/DirectoryRows";
import { avatarColor } from "@/lib/avatar";

export const dynamic = "force-dynamic";

// The directory: every coach with a live page, filterable by city. This is the
// answer to "I just signed up and follow nobody" — and the only screen where a
// fan meets a coach they weren't already handed a link to.
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ half?: string }>;
}) {
  // A link can name the half it means, and Studios is the only one that has
  // to: a bare /discover opens on Coaches. `?half=classes` is still honoured
  // as far as landing somewhere real, which is Coaches, because that half has
  // been taken out and old links have to land: a dated class list muddied
  // what Discover is for, which is finding somebody to follow.
  const { half } = await searchParams;
  const startHalf: DiscoverHalf = half === "studios" ? "studios" : "coaches";
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
  // One load for the whole screen. All three halves are the same rows read
  // three ways, so the users, the schedules and the studios are fetched once
  // and shared: the classes half fetching its own ran `publicSchedules`
  // twice and scanned the users twice to draw one page.
  const [everyone, hidden, followRows, askRows, studioRows] = await Promise.all([
    // Gyms come along: they own classes and have no handle, so a
    // handle-filtered query would drop every rota in the directory.
    db.select().from(schema.users),
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
    db.select().from(schema.studios).orderBy(schema.studios.name),
  ]);
  const allRows = everyone.filter((r) => !!r.handle && r.discoverable);
  const rows = allRows.filter((r) => !hidden.has(r.id));

  // Their own classes plus the shifts each has chosen to show, so the count
  // below matches what opening their page actually shows. The gyms' own rotas
  // left with the classes half: nothing on this screen reads them now, and a
  // query nobody reads is a query that gets slower without anybody noticing.
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

  const people: DirPerson[] = rows
    // Members list too now: a directory with everyone in it is what says the
    // room is lived-in, and the People tab's chips (All, Coaches, Members)
    // are how you narrow it. The quality bar stays a coach's alone: their
    // page has to be worth opening (a schedule, or enough profile), while a
    // member's row is just the person, which is all it claims to be.
    .filter((r) =>
      r.kind === "fan"
        ? !!r.name.trim()
        : !!r.name.trim() && !!(weekCount.get(r.id) || r.title?.trim() || r.about?.trim()),
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
      disciplines: r.disciplines,
      color: avatarColor(r),
    }))
    // Newest first: the list doubles as "who just joined", and the fresh
    // face at the top is the reason to keep opening it.
    .sort((a, b) => (joinedAt.get(b.id) ?? 0) - (joinedAt.get(a.id) ?? 0));

  const cities = [...new Set(people.map((c) => c.location).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );

  // The other half of the directory. Every studio, in name order: a row here
  // is a place, and a place doesn't get ranked by whether it signed up. The
  // tag says which of them you can see a week for, which is the useful part.
  const studios: DirStudio[] = studioRows.map((st) => ({
    id: st.id,
    slug: st.slug ?? st.id,
    name: st.name,
    address: st.address,
    photo: st.photo,
    types: st.types,
    hasSchedule: !!st.accountUserId,
    color: avatarColor({ id: st.id }),
  }));

  return (
    <>
      {/* The title lives inside the list now, so the coaches-only switch can
          sit directly across from it. */}
      <DiscoverList
        people={people}
        studios={studios}
        cities={cities}
        myCity={me.location?.trim() || null}
        startHalf={startHalf}
        backHref="/feed"
        hideBack
      />
    </>
  );
}
