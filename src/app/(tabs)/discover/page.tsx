import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { publicSchedules } from "@/lib/coachweek";
import { fansVisible } from "@/lib/flags";
import { hiddenFrom } from "@/lib/blocks";
import { getSessionUserId } from "@/lib/session";
import { buildDiscoverClasses } from "@/lib/discoverclasses";
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
  // A link can name the half it means, and anything whose word is not
  // "coaches" now has to: a bare /discover opens on Coaches, so a button
  // reading Find a class that lands on a list of people is the screen
  // contradicting the word that got somebody there.
  const { half } = await searchParams;
  const startHalf: DiscoverHalf =
    half === "coaches" || half === "studios" ? half : "classes";
  if (!(await fansVisible())) redirect("/");
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) redirect("/");
  const today = todayIso();
  // Blocked in either direction: not on the list. Discover is where someone
  // who was removed would go looking, so it has to be the same nothing the
  // profile is, and it drops the ones you removed too so you aren't handed
  // them back as a suggestion. The three loads only need the viewer, so they
  // run together.
  // One load for the whole screen. All three halves are the same rows read
  // three ways, so the users, the schedules and the studios are fetched once
  // and shared: the classes half fetching its own ran `publicSchedules`
  // twice and scanned the users twice to draw one page.
  const [everyone, hidden, followRows, askRows, marks, studioRows] = await Promise.all([
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
    // The viewer's own marks, for the ribbon on a class row.
    db
      .select({
        classId: schema.attendances.classId,
        occurrenceDate: schema.attendances.occurrenceDate,
      })
      .from(schema.attendances)
      .where(and(eq(schema.attendances.userId, userId), gte(schema.attendances.occurrenceDate, today))),
    db.select().from(schema.studios).orderBy(schema.studios.name),
  ]);
  const allRows = everyone.filter((r) => !!r.handle && r.discoverable);
  const rows = allRows.filter((r) => !hidden.has(r.id));

  // Their own classes plus the shifts each has chosen to show, so the count
  // below matches what opening their page actually shows. Run once, read by
  // the coach counts and the classes list alike. The gyms' own rotas come
  // beside them: a gym owns its classes and has no handle to find them by,
  // so the ids come from the users already in hand.
  const gymIds = everyone.filter((u) => u.kind === "gym").map((u) => u.id);
  const [schedRows, gymRows] = await Promise.all([
    publicSchedules(rows),
    gymIds.length
      ? db
          .select()
          .from(schema.classes)
          .where(and(inArray(schema.classes.userId, gymIds), eq(schema.classes.isPublic, true)))
      : Promise.resolve([]),
  ]);
  const classRows = schedRows.filter((c) => c.isPublic);

  // "Classes this week" — the signal that a page is actually live, and the
  // thing a fan is deciding on.
  const start = new Date(`${today}T00:00:00Z`);
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
      photo: r.photoThumb ?? r.photo,
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

  const studioCities = studioRows.map((studio) => {
    if (studio.placeKind === "virtual") return "";
    const parts = studio.address.split(",").map((part) => part.trim()).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 2] : "";
  });
  const cities = [
    ...new Set([...people.map((person) => person.location), ...studioCities].filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

  // The other half of the directory. Every studio, in name order: a row here
  // is a place, and a place doesn't get ranked by whether it signed up. The
  // tag says which of them you can see a week for, which is the useful part.
  // The directory should feel browsed, not alphabetized. Keep the assortment
  // stable for a day so it does not jump while someone moves between tabs,
  // and let real photography lead while the image library is still growing.
  const studioShuffleRank = (id: string) => {
    let hash = 2166136261;
    for (const char of `${today}|${id}`) {
      hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    }
    return hash >>> 0;
  };
  const studios: DirStudio[] = studioRows
    .map((st) => ({
      id: st.id,
      slug: st.slug ?? st.id,
      name: st.name,
      address: st.address,
      photo: st.photo,
      types: st.types,
      hasSchedule: !!st.accountUserId,
      color: avatarColor({ id: st.id }),
    }))
    .sort(
      (a, b) =>
        Number(!!b.photo) - Number(!!a.photo) ||
        studioShuffleRank(a.id) - studioShuffleRank(b.id),
    );

  return (
    <>
      {/* The title lives inside the list now, so the coaches-only switch can
          sit directly across from it. */}
      <DiscoverList
        people={people}
        studios={studios}
        classes={buildDiscoverClasses({
          viewerId: userId,
          owners: everyone,
          hidden,
          personRows: schedRows,
          gymRows,
          studios: studioRows,
          marks,
        })}
        todayIso={today}
        cities={cities}
        myCity={me.location?.trim() || null}
        startHalf={startHalf}
        backHref="/feed"
        hideBack
      />
    </>
  );
}
