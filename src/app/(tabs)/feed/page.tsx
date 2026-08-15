import { and, eq, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { getSessionUserId } from "@/lib/session";
import { FollowingLibrary } from "@/components/FollowingLibrary";

export const dynamic = "force-dynamic";

/**
 * Following is intentionally a library rather than a merged activity feed.
 * A person chooses whose calendar they mean, then sees that one calendar.
 */
export default async function FollowingPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) redirect("/");

  const [followRows, placeMarks] = await Promise.all([
    db
      .select({ trainerUserId: schema.subscribers.trainerUserId })
      .from(schema.subscribers)
      .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt))),
    db
      .select({ studioId: schema.studioEndorsements.targetStudioId })
      .from(schema.studioEndorsements)
      .where(
        and(
          eq(schema.studioEndorsements.endorserUserId, userId),
          eq(schema.studioEndorsements.trait, "been_here"),
        ),
      ),
  ]);

  const [peopleRows, placeRows] = await Promise.all([
    followRows.length
      ? db.select().from(schema.users).where(inArray(schema.users.id, followRows.map((row) => row.trainerUserId)))
      : Promise.resolve([]),
    placeMarks.length
      ? db.select().from(schema.studios).where(inArray(schema.studios.id, placeMarks.map((row) => row.studioId)))
      : Promise.resolve([]),
  ]);

  const people = peopleRows
    .filter((person) => person.handle && person.kind !== "gym")
    .map((person) => ({
      id: person.id,
      handle: person.handle!,
      name: person.name.trim() || person.handle!,
      sub: [person.location?.trim(), person.title?.trim()].filter(Boolean).join(" · ") || "View their calendar",
      photo: person.photoThumb ?? person.photo,
      color: avatarColor(person),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const places = placeRows
    .map((place) => ({
      id: place.id,
      slug: place.slug ?? place.id,
      name: place.name,
      sub: place.types.slice(0, 2).join(" · ") || (place.placeKind === "virtual" ? "Virtual place" : "Fitness place"),
      photo: place.photo,
      color: avatarColor({ id: place.id }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return <FollowingLibrary people={people} places={places} />;
}
