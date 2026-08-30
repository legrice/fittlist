"use client";

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 100;
const SCOPE_SEPARATOR = "\u0000";

type MemoryEntry = {
  value: unknown;
  writtenAt: number;
};

const entries = new Map<string, MemoryEntry>();
const inFlight = new Map<string, Promise<unknown | null>>();
const revisions = new Map<string, number>();
let activeScope: string | null = null;

function clientKey(key: string): string | null {
  if (typeof window === "undefined" || activeScope === null) return null;
  return `${activeScope}${SCOPE_SEPARATOR}${key}`;
}

function writeEntry(key: string, value: unknown) {
  entries.delete(key);
  entries.set(key, { value, writtenAt: Date.now() });

  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
    if (!inFlight.has(oldest)) revisions.delete(oldest);
  }
}

function revisionFor(key: string): number {
  return revisions.get(key) ?? 0;
}

function bumpRevision(key: string): void {
  revisions.set(key, revisionFor(key) + 1);
}

/**
 * Establish the signed-in account that owns all subsequent cache entries.
 * Changing accounts drops both settled and pending work so one viewer can
 * never read or repopulate another viewer's memory cache.
 */
export function setClientMemoryScope(scope: string | null): void {
  if (typeof window === "undefined") return;

  const nextScope = scope?.trim() || null;
  if (nextScope === activeScope) return;

  entries.clear();
  inFlight.clear();
  revisions.clear();
  activeScope = nextScope;
}

export function clearClientMemory(): void {
  if (typeof window === "undefined") return;
  entries.clear();
  inFlight.clear();
  revisions.clear();
}

export function readClientMemory<T>(key: string, maxAgeMs = DEFAULT_MAX_AGE_MS): T | null {
  const scopedKey = clientKey(key);
  if (scopedKey === null) return null;

  const entry = entries.get(scopedKey);
  if (!entry) return null;

  if (Date.now() - entry.writtenAt > Math.max(0, maxAgeMs)) {
    entries.delete(scopedKey);
    if (!inFlight.has(scopedKey)) revisions.delete(scopedKey);
    return null;
  }

  // Map insertion order doubles as the LRU list.
  entries.delete(scopedKey);
  entries.set(scopedKey, entry);
  return entry.value as T;
}

export function writeClientMemory<T>(key: string, value: T): void {
  const scopedKey = clientKey(key);
  if (scopedKey === null) return;
  bumpRevision(scopedKey);
  inFlight.delete(scopedKey);
  writeEntry(scopedKey, value);
}

export function loadClientMemory<T>(
  key: string,
  loader: () => Promise<T | null>,
): Promise<T | null> {
  const scopedKey = clientKey(key);
  // Before the account scope is bootstrapped (and during SSR), preserve the
  // caller's loading behavior without putting data in shared module memory.
  if (scopedKey === null) return loader();

  const pending = inFlight.get(scopedKey);
  if (pending) return pending as Promise<T | null>;

  const startedRevision = revisionFor(scopedKey);
  const request = Promise.resolve()
    .then(loader)
    .then((value) => {
      // Invalidation or an account change removes this exact promise. That
      // prevents a late response from restoring data that is no longer valid.
      if (
        value !== null &&
        inFlight.get(scopedKey) === request &&
        revisionFor(scopedKey) === startedRevision &&
        clientKey(key) === scopedKey
      ) {
        writeEntry(scopedKey, value);
      }
      return value;
    })
    .finally(() => {
      if (inFlight.get(scopedKey) === request) inFlight.delete(scopedKey);
      if (!entries.has(scopedKey) && !inFlight.has(scopedKey)) revisions.delete(scopedKey);
    });

  inFlight.set(scopedKey, request);
  return request;
}

export function invalidateClientMemory(key: string): void {
  const scopedKey = clientKey(key);
  if (scopedKey === null) return;
  const hadPendingRequest = inFlight.has(scopedKey);
  if (entries.has(scopedKey) || hadPendingRequest) bumpRevision(scopedKey);
  entries.delete(scopedKey);
  inFlight.delete(scopedKey);
  if (!hadPendingRequest) revisions.delete(scopedKey);
}

export function invalidateClientMemoryPrefix(prefix: string): void {
  if (typeof window === "undefined" || activeScope === null) return;
  const scopedPrefix = `${activeScope}${SCOPE_SEPARATOR}${prefix}`;
  const matches = new Set<string>();

  for (const key of entries.keys()) {
    if (key.startsWith(scopedPrefix)) matches.add(key);
  }
  for (const key of inFlight.keys()) {
    if (key.startsWith(scopedPrefix)) matches.add(key);
  }

  for (const key of matches) {
    const hadPendingRequest = inFlight.has(key);
    bumpRevision(key);
    entries.delete(key);
    inFlight.delete(key);
    if (!hadPendingRequest) revisions.delete(key);
  }
}
