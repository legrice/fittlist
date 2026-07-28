// One shape for every location: "City, ST".
//
// Discover groups coaches by the exact string, so "Jersey City" and
// "Jersey City, NJ" became two chips for one city. Free text can't be
// deduplicated after the fact, so it gets normalized on the way in instead.

const STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY", "puerto rico": "PR",
};
const CODES = new Set(Object.values(STATES));

/** Words that stay lowercase inside a name, and ones that stay all-caps. */
const SMALL = new Set(["of", "the", "on", "upon", "in", "at", "by", "de", "la", "le"]);

function titleCase(s: string): string {
  const words = s.toLowerCase().split(/\s+/).filter(Boolean);
  return words
    .map((w, i) => {
      if (i > 0 && SMALL.has(w)) return w;
      // Keep hyphenated and apostrophed names sensible: Winston-Salem, O'Fallon.
      return w
        .split("-")
        .map((part) =>
          part.replace(/^([a-z])/, (c) => c.toUpperCase()).replace(/^(o')([a-z])/i, (_, p, c) => `O'${c.toUpperCase()}`),
        )
        .join("-");
    })
    .join(" ");
}

export type LocationResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/**
 * "jersey city, nj" / "Jersey City New Jersey" / "JERSEY CITY,NJ"
 *   -> "Jersey City, NJ"
 *
 * Empty clears the field. A city with no region is refused rather than stored,
 * because "Jersey City" and "Jersey City, NJ" can't be merged later without
 * guessing which Jersey City was meant.
 */
export function normalizeLocation(raw: string | null | undefined): LocationResult {
  const input = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!input) return { ok: true, value: null };

  const ask = {
    ok: false as const,
    error: "Add the state too, like Jersey City, NJ.",
  };

  // "City, Region" is the usual shape. Without a comma, try to peel a state off
  // the end so "Jersey City NJ" and "Jersey City New Jersey" still work.
  let city = input;
  let region = "";
  const comma = input.lastIndexOf(",");
  if (comma > 0) {
    city = input.slice(0, comma).trim();
    region = input.slice(comma + 1).trim();
  } else {
    const words = input.split(" ");
    for (const take of [3, 2, 1]) {
      if (words.length <= take) continue;
      const tail = words.slice(-take).join(" ").toLowerCase().replace(/\./g, "");
      if (STATES[tail] || (take === 1 && CODES.has(tail.toUpperCase()))) {
        city = words.slice(0, -take).join(" ");
        region = words.slice(-take).join(" ");
        break;
      }
    }
  }

  if (!city || !region) return ask;

  const key = region.toLowerCase().replace(/\./g, "");
  const code = STATES[key] ?? (CODES.has(key.toUpperCase()) ? key.toUpperCase() : null);
  if (code) return { ok: true, value: `${titleCase(city)}, ${code}` };

  // Not a US state. Keep it rather than refusing: a two-letter province or a
  // country reads fine and still gives one consistent string per place.
  const other = region.length <= 3 ? region.toUpperCase() : titleCase(region);
  return { ok: true, value: `${titleCase(city)}, ${other}` };
}
