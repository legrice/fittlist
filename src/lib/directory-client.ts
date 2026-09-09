"use client";

import type * as discover from "@/app/actions/discover";
import type * as search from "@/app/actions/search";

// Browsing must not wait in the server-action mutation queue. Abort the
// transport too, so a stalled read cannot hold up the next query or retry.
async function readDirectory<T>(params: URLSearchParams): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 14_000);
  try {
    const response = await fetch(`/api/directory?${params}`, {
      signal: controller.signal,
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error("Directory unavailable");
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

function nearby(kind: string, miles?: number, center?: { lat: number; lng: number }) {
  const params = new URLSearchParams({ kind });
  if (miles) params.set("miles", String(miles));
  if (center) { params.set("lat", String(center.lat)); params.set("lng", String(center.lng)); }
  return params;
}

export function discoverPeople(miles?: number, center?: { lat: number; lng: number }) {
  return readDirectory<Awaited<ReturnType<typeof discover.discoverPeople>>>(nearby("people", miles, center));
}
export function discoverStudios(miles?: number, center?: { lat: number; lng: number }) {
  return readDirectory<Awaited<ReturnType<typeof discover.discoverStudios>>>(nearby("places", miles, center));
}
export function discoverGroups(miles?: number, center?: { lat: number; lng: number }) {
  return readDirectory<Awaited<ReturnType<typeof discover.discoverGroups>>>(nearby("groups", miles, center));
}
export function searchDirectory(query: string) {
  return readDirectory<Awaited<ReturnType<typeof search.searchDirectory>>>(new URLSearchParams({ kind: "search", q: query }));
}
