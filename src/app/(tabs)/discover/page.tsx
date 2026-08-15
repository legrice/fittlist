import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { hiddenFrom } from "@/lib/blocks";
import { getSessionUserId } from "@/lib/session";
import type { DirPerson, DirStudio } from "@/components/DirectoryRows";
import { SimplifiedDiscover } from "@/components/SimplifiedDiscover";

export const dynamic = "force-dynamic";

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ half?: string }>;
}) {
  const { half } = await searchParams;
  const startTab = half === "places" || half === "groups" ? half : "people";
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) redirect("/");

  const [users, studios, hidden, follows, requests] = await Promise.all([
    db.select().from(schema.users),
    db.select().from(schema.studios),
    hiddenFrom(userId),
    db
      .select({ trainerUserId: schema.subscribers.trainerUserId })
      .from(schema.subscribers)
      .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt))),
    db
      .select({ trainerUserId: schema.followRequests.trainerUserId })
      .from(schema.followRequests)
      .where(eq(schema.followRequests.requesterUserId, userId)),
  ]);
  const following = new Set(follows.map((row) => row.trainerUserId));
  const requested = new Set(requests.map((row) => row.trainerUserId));

  const people: DirPerson[] = users
    .filter((person) => person.id !== userId && person.handle && person.discoverable && person.kind !== "gym" && !hidden.has(person.id))
    .map((person) => ({
      id: person.id,
      handle: person.handle!,
      name: person.name.trim() || person.handle!,
      kind: (person.kind === "fan" ? "member" : "coach") as "member" | "coach",
      photo: person.photoThumb ?? person.photo,
      title: person.title ?? "",
      location: person.location?.trim() ?? "",
      classesThisWeek: 0,
      following: following.has(person.id),
      requested: requested.has(person.id),
      availability: person.kind === "fan" ? null : person.availability,
      disciplines: person.disciplines,
      color: avatarColor(person),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const places: DirStudio[] = studios
    .map((place) => ({
      id: place.id,
      slug: place.slug ?? place.id,
      name: place.name,
      address: place.address,
      photo: place.photo,
      types: place.types,
      hasSchedule: !!place.accountUserId,
      color: avatarColor({ id: place.id }),
    }))
    .sort((a, b) => Number(!!b.photo) - Number(!!a.photo) || a.name.localeCompare(b.name));

  const cities = [...new Set([
    ...people.map((person) => person.location.split(",")[0]?.trim()),
    ...places.map((place) => place.address.split(",").at(-2)?.trim()),
  ].filter((city): city is string => !!city))].sort();

  return <SimplifiedDiscover people={people} places={places} cities={cities} startTab={startTab} />;
}
