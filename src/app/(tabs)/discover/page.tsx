import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { fansVisible } from "@/lib/flags";
import { hiddenFrom } from "@/lib/blocks";
import { getSessionUserId } from "@/lib/session";
import { todayIso } from "@/lib/format";
import { DiscoverList, type DiscoverHalf } from "@/components/DiscoverList";
import type { DirPerson, DirStudio } from "@/components/DirectoryRows";
import { avatarColor } from "@/lib/avatar";
import { addBrowse } from "@/app/actions/discover";

export const dynamic = "force-dynamic";

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ half?: string }>;
}) {
  const { half } = await searchParams;
  // Keep old preview/bookmark URLs useful while the visible information
  // architecture moves from Coaches / Classes / Studios to the prototype's
  // People / Places / Groups. Classes now belongs to calendar creation, not
  // Explore, so an old class link returns to People rather than resurrecting
  // the catalog.
  const startHalf: DiscoverHalf | undefined =
    half === "places" || half === "studios"
      ? "places"
      : half === "people" || half === "coaches"
        ? "people"
        : half === "classes"
          ? "classes"
          : undefined;

  if (!(await fansVisible())) redirect("/");
  const userId = await getSessionUserId();
  if (!userId) redirect("/");

  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) redirect("/");

  const [everyone, cityRows, hidden, followRows, askRows, studioRows, favoriteStudioRows, upcoming] = await Promise.all([
    db.select().from(schema.users),
    db.select({ location: schema.users.location }).from(schema.users),
    hiddenFrom(userId),
    db
          .select({ trainerUserId: schema.subscribers.trainerUserId })
          .from(schema.subscribers)
          .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt))),
    db
          .select({ trainerUserId: schema.followRequests.trainerUserId })
          .from(schema.followRequests)
          .where(eq(schema.followRequests.requesterUserId, userId)),
    db.select().from(schema.studios).orderBy(schema.studios.name),
    db.select({ studioId: schema.studioEndorsements.targetStudioId }).from(schema.studioEndorsements).where(and(eq(schema.studioEndorsements.endorserUserId, userId), eq(schema.studioEndorsements.trait, "been_here"))),
    addBrowse(),
  ]);

  const rows = everyone.filter(
    (row) => !!row.handle && row.discoverable && !hidden.has(row.id) && row.id !== userId,
  );
  const following = new Set(followRows.map((row) => row.trainerUserId));
  const requested = new Set(askRows.map((row) => row.trainerUserId));
  const joinedAt = new Map(rows.map((row) => [row.id, row.createdAt?.getTime() ?? 0]));

  const people: DirPerson[] = rows
    .filter((row) => !!row.name.trim())
    .map((row) => ({
      id: row.id,
      handle: row.handle!,
      name: row.name,
      kind: (row.kind === "fan" ? "member" : "coach") as "coach" | "member",
      photo: row.photoThumb ?? row.photo,
      title: row.title ?? "",
      location: row.location?.trim() ?? "",
      classesThisWeek: 0,
      following: following.has(row.id),
      requested: requested.has(row.id),
      availability: row.kind === "fan" ? null : row.availability,
      disciplines: row.disciplines,
      color: avatarColor(row),
    }))
    .sort((a, b) => (joinedAt.get(b.id) ?? 0) - (joinedAt.get(a.id) ?? 0));

  const looksLikeStreet = (value: string) =>
    /^\d/.test(value) || /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|pl|place)\b/i.test(value);
  const profileCities = [
    ...people.map((person) => person.location),
    ...cityRows.map((row) => row.location?.trim() ?? ""),
  ]
    .map((location) => location.split(",")[0]?.trim() ?? "")
    .filter((city) => city && !looksLikeStreet(city));
  const knownCities = [...new Set(profileCities)].sort((a, b) => b.length - a.length);
  const studioCities = studioRows.map((studio) => {
    if (studio.placeKind === "virtual") return "";
    const known = knownCities.find((city) => studio.address.toLowerCase().includes(city.toLowerCase()));
    if (known) return known;
    const parts = studio.address.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 3) return parts[parts.length - 2];
    if (parts.length === 2 && !looksLikeStreet(parts[0])) return parts[0];
    return "";
  });
  const cities = [...new Set([...profileCities, ...studioCities].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  const today = todayIso();
  const favoriteStudios = new Set(favoriteStudioRows.map((row) => row.studioId));
  const studioShuffleRank = (id: string) => {
    let hash = 2166136261;
    for (const char of `${today}|${id}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return hash >>> 0;
  };
  const studios: DirStudio[] = studioRows
    .map((studio) => ({
      id: studio.id,
      slug: studio.slug ?? studio.id,
      name: studio.name,
      address: studio.address,
      photo: studio.photo,
      types: studio.types,
      hasSchedule: !!studio.accountUserId,
      color: avatarColor({ id: studio.id }),
      favorited: favoriteStudios.has(studio.id),
    }))
    .sort(
      (a, b) =>
        Number(!!b.photo) - Number(!!a.photo) ||
        studioShuffleRank(a.id) - studioShuffleRank(b.id),
    );

  return (
    <DiscoverList
      people={people}
      studios={studios}
      cities={cities}
      myCity={me.location?.trim() || null}
      startHalf={startHalf}
      upcoming={upcoming ?? []}
      backHref="/feed"
      hideBack
    />
  );
}
