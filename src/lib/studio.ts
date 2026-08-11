// What kind of gym a studio is. A studio is usually more than one of these —
// a strength gym that also runs HYROX classes — so the editor picks a set.
export const STUDIO_TYPES = [
  // lifting and conditioning
  "Strength",
  "Functional",
  "CrossFit",
  "HYROX",
  "Bootcamp",
  "HIIT",
  "Conditioning",
  "Powerlifting",
  "Olympic weightlifting",
  "Kettlebell",
  "Calisthenics",
  "Gymnastics",
  "Sports performance",
  "Personal training",
  // mind-body
  "Yoga",
  "Hot yoga",
  "Pilates",
  "Reformer Pilates",
  "Barre",
  "Meditation",
  // combat
  "Boxing",
  "Kickboxing",
  "Martial arts",
  // endurance
  "Cycling",
  "Run club",
  "Rowing",
  "Swimming",
  "Triathlon",
  // sport and movement
  "Climbing",
  "Dance",
  "Aerial",
  "Tennis",
  "Pickleball",
  "Golf",
  "Basketball",
  // care and recovery
  "Mobility",
  "Stretch",
  "Recovery",
  "Sauna & cold plunge",
  "Physical therapy",
  "Massage therapy",
  "Acupuncture",
  "Chiropractic",
  "Nutrition",
  "Reiki",
  "Breathwork",
  "Wellness services",
] as const;

export const PLACE_KINDS = ["studio", "wellness", "event", "outdoor", "virtual"] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];
export const PLACE_KIND_LABELS: Record<PlaceKind, string> = {
  studio: "Gym or studio",
  wellness: "Health & wellness space",
  event: "Event or pop-up",
  outdoor: "Outdoor or public space",
  virtual: "Virtual",
};

export function placeKindLabel(kind: string): string {
  return PLACE_KIND_LABELS[kind as PlaceKind] ?? PLACE_KIND_LABELS.studio;
}

// A studio's page lives at /s/{slug}. Rows created before slugs existed fall
// back to the id, so every studio is reachable either way.
export function studioPath(s: { slug: string | null; id: string }) {
  return `/s/${s.slug ?? s.id}`;
}

export function mapsUrlFor(s: { name: string; address: string }) {
  return `https://maps.google.com/?q=${encodeURIComponent(`${s.name}, ${s.address}`)}`;
}
