// What kind of gym a studio is. A studio is usually more than one of these —
// a strength gym that also runs HYROX classes — so the editor picks a set.
export const STUDIO_TYPES = [
  "Strength",
  "Functional",
  "CrossFit",
  "HYROX",
  "Bootcamp",
  "Yoga",
  "Pilates",
  "Barre",
  "Boxing",
  "Martial arts",
  "Cycling",
  "Run club",
  "Climbing",
  "Swimming",
  "Dance",
  "Recovery",
] as const;

// A studio's page lives at /s/{slug}. Rows created before slugs existed fall
// back to the id, so every studio is reachable either way.
export function studioPath(s: { slug: string | null; id: string }) {
  return `/s/${s.slug ?? s.id}`;
}

export function mapsUrlFor(s: { name: string; address: string }) {
  return `https://maps.google.com/?q=${encodeURIComponent(`${s.name}, ${s.address}`)}`;
}
