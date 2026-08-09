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

type OpenMeteoHit = {
  name: string;
  latitude: number;
  longitude: number;
  country_code?: string;
  country?: string;
  admin1?: string;
};

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

async function fetchWithTimeout(url: string, headers?: Record<string, string>) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 2500);
  try {
    return await fetch(url, { signal: ctl.signal, headers });
  } finally {
    clearTimeout(t);
  }
}

/** The server's own copy of the picker's lookup, for text that was typed
 *  rather than picked: the best single match, or null. */
export async function geocodeCity(q: string): Promise<GeoPlace | null> {
  const name = q.trim().split(",")[0];
  if (name.length < 2) return null;
  try {
    const res = await fetchWithTimeout(
      `${OPEN_METEO}?name=${encodeURIComponent(name)}&count=1&language=en&format=json`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: OpenMeteoHit[] };
    const hit = data.results?.[0];
    if (!hit) return null;
    return { label: placeLabel(hit), lat: hit.latitude, lng: hit.longitude };
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
