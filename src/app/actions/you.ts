"use server";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { myStaffStudios } from "@/app/actions/gym";
import type { YouDashboardData, YouFavoritePerson, YouFavoritePlace } from "@/components/YouDashboard";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { getSessionUserId } from "@/lib/session";

/** The one data source for the standalone You page and its header sheet. */
export async function youDashboardData(): Promise<YouDashboardData | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me?.handle || !me.onboardedAt) return null;

  const [favoriteRows, placeRows, managed] = await Promise.all([
    db
      .select({ trainerUserId: schema.subscribers.trainerUserId })
      .from(schema.subscribers)
      .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt)))
      .orderBy(desc(schema.subscribers.createdAt)),
    db
      .select({ studioId: schema.studioEndorsements.targetStudioId })
      .from(schema.studioEndorsements)
      .where(and(
        eq(schema.studioEndorsements.endorserUserId, userId),
        eq(schema.studioEndorsements.trait, "been_here"),
      )),
    myStaffStudios(),
  ]);

  const personIds = [...new Set(favoriteRows.map((row) => row.trainerUserId))]
    .filter((id) => id !== userId);
  const peopleData = personIds.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, personIds))
    : [];
  const peopleById = new Map(peopleData.map((person) => [person.id, person]));
  const people: YouFavoritePerson[] = personIds.flatMap((id) => {
    const person = peopleById.get(id);
    if (!person?.handle || person.kind === "gym") return [];
    return [{
      id: person.id,
      name: person.name.trim() || person.email.split("@")[0],
      handle: person.handle,
      photo: person.photoThumb ?? person.photo,
      color: avatarColor(person),
      title: person.title?.trim() ?? "",
    }];
  });

  const placeIds = [...new Set(placeRows.map((row) => row.studioId))];
  const placeData = placeIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, placeIds))
    : [];
  const places: YouFavoritePlace[] = placeData.map((place) => ({
    id: place.id,
    name: place.name,
    slug: place.slug ?? place.id,
    photo: place.photo,
    types: place.types,
  }));

  return {
    me: {
      name: me.name.trim() || me.email.split("@")[0],
      handle: me.handle,
      title: me.title?.trim() ?? "",
      location: me.location?.trim() ?? "",
      photo: me.photoThumb ?? me.photo,
      color: avatarColor(me),
      coaching: me.kind !== "fan",
    },
    people,
    places,
    managed: managed.filter((place) => place.admin),
    shareHref: me.kind === "fan" ? "/membershare" : "/coachshare",
  };
}
