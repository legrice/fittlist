/**
 * Fill missing profile and studio coordinates from their existing location
 * text. Existing coordinates are never overwritten.
 *
 * Dry run (counts only):
 *   node --env-file=.env.local --import tsx scripts/backfill-geolocation.ts
 * Apply:
 *   node --env-file=.env.local --import tsx scripts/backfill-geolocation.ts --apply
 */
import { and, eq, isNotNull, isNull, ne, or } from "drizzle-orm";
import { getDb, schema } from "../src/db/index";
import { geocodeAddress, geocodeCity } from "../src/lib/geocode";

const apply = process.argv.includes("--apply");
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const db = await getDb();
  const [profiles, studios] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        location: schema.users.location,
        lat: schema.users.locationLat,
        lng: schema.users.locationLng,
      })
      .from(schema.users)
      .where(
        and(
          isNotNull(schema.users.location),
          ne(schema.users.location, ""),
          or(isNull(schema.users.locationLat), isNull(schema.users.locationLng)),
        ),
      ),
    db
      .select({
        id: schema.studios.id,
        address: schema.studios.address,
        placeKind: schema.studios.placeKind,
        lat: schema.studios.lat,
        lng: schema.studios.lng,
      })
      .from(schema.studios)
      .where(
        and(
          ne(schema.studios.address, ""),
          ne(schema.studios.placeKind, "virtual"),
          or(isNull(schema.studios.lat), isNull(schema.studios.lng)),
        ),
      ),
  ]);

  console.log(
    JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      profilesMissingCoordinates: profiles.length,
      studiosMissingCoordinates: studios.length,
    }),
  );
  if (!apply) return;

  const cityCache = new Map<string, Awaited<ReturnType<typeof geocodeCity>>>();
  let profilesUpdated = 0;
  let profilesMissed = 0;
  for (const profile of profiles) {
    const query = profile.location!.trim();
    const key = query.toLowerCase();
    let point = cityCache.get(key);
    if (point === undefined) {
      point = await geocodeCity(query);
      cityCache.set(key, point);
    }
    if (!point) {
      profilesMissed += 1;
      continue;
    }
    await db
      .update(schema.users)
      .set({ locationLat: point.lat, locationLng: point.lng })
      .where(
        and(
          eq(schema.users.id, profile.id),
          or(isNull(schema.users.locationLat), isNull(schema.users.locationLng)),
        ),
      );
    profilesUpdated += 1;
  }

  let studiosUpdated = 0;
  let studiosMissed = 0;
  for (const studio of studios) {
    // Nominatim asks bulk clients to stay at or below one request per second.
    if (studiosUpdated + studiosMissed > 0) await wait(1_100);
    const point = await geocodeAddress(studio.address.trim());
    if (!point) {
      studiosMissed += 1;
      continue;
    }
    await db
      .update(schema.studios)
      .set({ lat: point.lat, lng: point.lng })
      .where(
        and(
          eq(schema.studios.id, studio.id),
          or(isNull(schema.studios.lat), isNull(schema.studios.lng)),
        ),
      );
    studiosUpdated += 1;
  }

  console.log(
    JSON.stringify({ profilesUpdated, profilesMissed, studiosUpdated, studiosMissed }),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
