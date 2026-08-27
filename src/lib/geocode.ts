// Real coordinates for the places people type, so "near you" can mean
// something. Two lookups, both free and keyless, both best-effort: a miss
// or a timeout stores null coordinates and nothing else changes, because
// nothing in the app is allowed to fail on somebody else's API.

/** One city, as the picker's suggestion shape. */
export type GeoPlace = {
  /** "Montclair, NJ" at home, "Lisbon, Portugal" abroad. */
  label: string;
  lat: number;
  lng: number;
  /** IANA timezone returned by the geocoder when available. */
  timeZone?: string;
};

const US_STATES: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK",
  Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI",
  Wyoming: "WY", "District of Columbia": "DC",
};

const US_STATE_NAMES = new Map(
  Object.entries(US_STATES).map(([name, abbreviation]) => [abbreviation, name]),
);

export type OpenMeteoHit = {
  name: string;
  latitude: number;
  longitude: number;
  country_code?: string;
  country?: string;
  admin1?: string;
  timezone?: string;
};

/** Preserve the place-name search order when no context was typed, but prefer
 * an exact state/country match when it was. This keeps "Montclair, NJ" from
 * silently becoming the more populous California result. */
export function rankOpenMeteoHits(hits: OpenMeteoHit[], query: string): OpenMeteoHit[] {
  const parts = query.split(",").map((part) => part.trim()).filter(Boolean);
  const context = parts.slice(1).join(" ").toLowerCase();
  const stateName = US_STATE_NAMES.get(parts[1]?.toUpperCase() ?? "")?.toLowerCase();
  if (!context) return [...hits];
  const score = (candidate: OpenMeteoHit) => {
    const admin = candidate.admin1?.toLowerCase() ?? "";
    const country = candidate.country?.toLowerCase() ?? "";
    const countryCode = candidate.country_code?.toLowerCase() ?? "";
    return (
      (stateName && admin === stateName ? 4 : 0) +
      (context.includes(admin) && admin ? 3 : 0) +
      (context.includes(country) && country ? 2 : 0) +
      (context.includes(countryCode) && countryCode ? 1 : 0)
    );
  };
  return hits
    .map((hit, index) => ({ hit, index, score: score(hit) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ hit }) => hit);
}

/** "Montclair" + "New Jersey" + "US" -> "Montclair, NJ"; elsewhere the
 *  country does the anchoring. The label is what lands in users.location,
 *  so it keeps the "City, ST" shape Discover already groups by. */
export function placeLabel(hit: OpenMeteoHit): string {
  if (hit.country_code === "US" && hit.admin1 && US_STATES[hit.admin1])
    return `${hit.name}, ${US_STATES[hit.admin1]}`;
  if (hit.admin1 && hit.country_code === "US") return `${hit.name}, ${hit.admin1}`;
  return hit.country ? `${hit.name}, ${hit.country}` : hit.name;
}

const OPEN_METEO = "https://geocoding-api.open-meteo.com/v1/search";

async function fetchWithTimeout(
  url: string,
  headers?: Record<string, string>,
  timeoutMs = 2500,
) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ctl.signal, headers });
  } finally {
    clearTimeout(t);
  }
}

/** The server's own copy of the picker's lookup, for text that was typed
 *  rather than picked: the best single match, or null. */
export async function geocodeCity(q: string): Promise<GeoPlace | null> {
  const parts = q.split(",").map((part) => part.trim()).filter(Boolean);
  const name = parts[0] ?? "";
  if (name.length < 2) return null;
  try {
    const res = await fetchWithTimeout(
      `${OPEN_METEO}?name=${encodeURIComponent(name)}&count=10&language=en&format=json`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: OpenMeteoHit[] };
    const hit = rankOpenMeteoHits(data.results ?? [], q)[0];
    if (!hit) return null;
    return {
      label: placeLabel(hit),
      lat: hit.latitude,
      lng: hit.longitude,
      timeZone: hit.timezone,
    };
  } catch {
    return null;
  }
}

/** A street address to a point, for a studio: Nominatim, one lookup per
 *  save, which is the polite end of their usage policy (autocomplete is
 *  the impolite end, which is why the studio form stays a typed address). */
export async function geocodeAddress(q: string): Promise<{ lat: number; lng: number } | null> {
  if (q.trim().length < 4) return null;
  try {
    // Census is particularly good at US route/highway addresses, which the
    // global provider sometimes cannot resolve. Prefer it when the text has
    // an obvious state + ZIP, then retain Nominatim for everywhere else.
    if (/\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/i.test(q)) {
      const census = await fetchWithTimeout(
        `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(q)}&benchmark=Public_AR_Current&format=json`,
        undefined,
        5000,
      );
      if (census.ok) {
        const data = (await census.json()) as {
          result?: { addressMatches?: { coordinates?: { x: number; y: number } }[] };
        };
        const coordinates = data.result?.addressMatches?.[0]?.coordinates;
        if (coordinates && Number.isFinite(coordinates.x) && Number.isFinite(coordinates.y)) {
          return { lat: coordinates.y, lng: coordinates.x };
        }
      }
    }
    const res = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
      { "User-Agent": "fittlist.co (hello@fittlist.co)" },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { lat: string; lon: string }[];
    const hit = data[0];
    if (!hit) return null;
    return { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) };
  } catch {
    return null;
  }
}

/** Resolve coordinates to an IANA timezone. Best effort: callers retain the
 * account/default zone if the public provider is unavailable. */
export async function timeZoneAtCoordinates(lat: number, lng: number): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  try {
    const res = await fetchWithTimeout(
      `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&forecast_days=1&timezone=auto&current=temperature_2m`,
      undefined,
      3000,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { timezone?: string };
    return data.timezone?.trim() || null;
  } catch {
    return null;
  }
}

/** Kilometres between two points, for ranking coaches by nearness. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
