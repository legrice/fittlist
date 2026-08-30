/**
 * Content-derived revision for the Share editor and its private image cache.
 *
 * The editor used to receive `Date.now()`, which made the same calendar look
 * new on every visit and defeated both the browser cache and the compose
 * route's data cache. This serializer deliberately keeps array order (the
 * poster's row order is meaningful), but sorts object keys so database JSON
 * and future HubItem fields produce the same revision regardless of property
 * insertion order.
 */

export type ShareContentRevisionInput = {
  kind: string | null | undefined;
  handle: string | null | undefined;
  storyPrefs: unknown;
  /** Keep this generic so newly added share-item fields invalidate the cache
   * without requiring a second hand-maintained fingerprint schema. */
  items: readonly unknown[];
};

const LONG_STRING_THRESHOLD = 4_096;

/**
 * Background photos can be multi-megabyte data URLs. Serializing one into a
 * second multi-megabyte canonical string and then hashing it with BigInt made
 * cache-key generation itself noticeable. Collapse only long strings to a
 * deterministic, fast 32-bit digest first; short labels and URLs stay fully
 * represented in the canonical payload.
 */
function canonicalString(value: string): string {
  if (value.length <= LONG_STRING_THRESHOLD) return JSON.stringify(value);

  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }

  return JSON.stringify(
    `@long:${value.length}:${(first >>> 0).toString(36)}:${(second >>> 0).toString(36)}`,
  );
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "string":
      return canonicalString(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return Number.isFinite(value) ? String(Object.is(value, -0) ? 0 : value) : "null";
    case "bigint":
      return JSON.stringify(`${value}n`);
    case "undefined":
    case "function":
    case "symbol":
      return "null";
    case "object": {
      if (value instanceof Date) return JSON.stringify(value.toISOString());
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

      const record = value as Record<string, unknown>;
      const entries = Object.keys(record)
        .filter((key) => {
          const field = record[key];
          return field !== undefined && typeof field !== "function" && typeof field !== "symbol";
        })
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
      return `{${entries.join(",")}}`;
    }
  }

  return "null";
}

/** A deterministic, URL-safe integer within JavaScript's precise range. */
export function shareContentRevision(input: ShareContentRevisionInput): number {
  const canonical = canonicalJson({
    kind: input.kind?.trim() ?? "",
    handle: input.handle?.trim() ?? "",
    storyPrefs: input.storyPrefs ?? {},
    items: input.items,
  });

  // 64-bit FNV-1a, reduced to 53 bits so the public API can remain a number.
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= BigInt(canonical.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return Number(hash & 0x1fffffffffffffn);
}
