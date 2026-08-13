import type { MetadataRoute } from "next";
import { getDb, schema } from "@/db";
import { siteOrigin } from "@/lib/format";
import { locationSlug } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const db = await getDb();
  const [people, places, classRows] = await Promise.all([
    db.select().from(schema.users),
    db.select().from(schema.studios),
    db.select().from(schema.classes),
  ]);

  const publicPeople = people.filter(
    (person) => person.handle && person.discoverable && person.kind !== "gym",
  );
  const personById = new Map(publicPeople.map((person) => [person.id, person]));
  const studioByAccount = new Map(
    places.filter((place) => place.accountUserId).map((place) => [place.accountUserId!, place]),
  );
  const citySlugs = [...new Set(
    publicPeople
      .filter((person) => person.kind !== "fan")
      .map((person) => locationSlug(person.location))
      .filter(Boolean),
  )];

  return [
    { url: origin, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/about`, changeFrequency: "monthly", priority: 0.5 },
    ...publicPeople.map((person) => ({
      url: `${origin}/${person.handle}`,
      changeFrequency: "weekly" as const,
      priority: person.kind === "fan" ? 0.5 : 0.8,
    })),
    ...places.map((place) => ({
      url: `${origin}/s/${place.slug ?? place.id}`,
      lastModified: place.createdAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...classRows.flatMap((item) => {
      if (!item.isPublic) return [];
      const person = personById.get(item.userId);
      const place = studioByAccount.get(item.userId);
      const key = person?.handle ?? place?.slug;
      if (!key) return [];
      const prefix = person ? "" : "/s";
      return [{
        url: `${origin}${prefix}/${key}/${item.id}`,
        lastModified: item.createdAt,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }];
    }),
    ...citySlugs.map((city) => ({
      url: `${origin}/trainers/${city}`,
      changeFrequency: "weekly" as const,
      priority: 0.75,
    })),
  ];
}
