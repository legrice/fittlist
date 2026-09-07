"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadCalendarRemainder, loadFollowingCalendarMonth } from "@/app/actions/calendar-stream";
import { withTimeout } from "@/lib/async";
import { invalidateClientMemory, loadClientMemory, readClientMemory } from "@/lib/client-memory";
import type { FeedCoach, FeedItem, RailPerson } from "@/components/FollowingScreen";

type CalendarData = { items: FeedItem[]; coaches: FeedCoach[]; cats: string[]; myRail: RailPerson[] };
type MonthData = NonNullable<Awaited<ReturnType<typeof loadFollowingCalendarMonth>>>;
export type CalendarMonthState = "loading" | "loaded" | "error";

/** Keep each response as a date window, so a late first-month response cannot
 * erase a future month and a refreshed month can remove canceled classes. */
export function useFollowingCalendar(seed: CalendarData, todayIso: string, enabled: boolean) {
  const { items, coaches, cats, myRail } = seed;
  const [data, setData] = useState(seed);
  const [pending, setPending] = useState(enabled);
  const [error, setError] = useState(false);
  const [months, setMonths] = useState<Record<string, CalendarMonthState>>({});
  const [loadedThrough, setLoadedThrough] = useState(() => addDays(todayIso, 1));
  const generation = useRef(0);
  const remainder = useRef<CalendarData | null>(null);
  const windows = useRef(new Map<string, MonthData>());
  const requests = useRef(new Map<string, Promise<boolean>>());

  const publish = useCallback(() => {
    const mergedItems = new Map(items.map((item) => [item.key, item]));
    const mergedCoaches = new Map(coaches.map((coach) => [coach.id, coach]));
    const mergedCats = new Set(cats);
    const merge = (part: CalendarData) => {
      for (const item of part.items) mergedItems.set(item.key, item);
      for (const coach of part.coaches) mergedCoaches.set(coach.id, coach);
      for (const cat of part.cats) mergedCats.add(cat);
    };
    if (remainder.current) merge(remainder.current);
    const ordered = [...windows.current.values()].sort((a, b) => a.from.localeCompare(b.from));
    let through = addDays(todayIso, remainder.current ? 30 : 1);
    for (const window of ordered) {
      for (const [key, item] of mergedItems) {
        if (item.iso >= window.from && item.iso <= window.through) mergedItems.delete(key);
      }
      merge(window);
      if (window.from <= addDays(through, 1) && window.through > through) through = window.through;
    }
    setData({ items: [...mergedItems.values()], coaches: [...mergedCoaches.values()], cats: [...mergedCats], myRail: remainder.current?.myRail ?? myRail });
    setLoadedThrough(through);
  }, [items, coaches, cats, myRail, todayIso]);

  const loadRemainder = useCallback(async () => {
    const version = generation.current;
    setPending(!remainder.current);
    setError(false);
    try {
      const result = await loadClientMemory(`calendar-remainder:${todayIso}`, () => withTimeout(loadCalendarRemainder()));
      if (version !== generation.current) return;
      if (!result) throw new Error("Calendar unavailable");
      remainder.current = result;
      publish();
    } catch {
      if (version === generation.current) setError(true);
    } finally {
      if (version === generation.current) setPending(false);
    }
  }, [publish, todayIso]);

  useEffect(() => {
    generation.current += 1;
    windows.current.clear();
    requests.current.clear();
    remainder.current = null;
    setMonths({});
    setError(false);
    setPending(enabled);
    publish();
    if (!enabled) return;
    const remembered = readClientMemory<CalendarData>(`calendar-remainder:${todayIso}`);
    if (remembered) {
      remainder.current = remembered;
      publish();
      setPending(false);
    }
    // A refreshed seed must not reuse an earlier seed's in-flight response.
    // The generation guard protects local awaits; invalidate the shared cache
    // promise too before starting work for the new relationship graph.
    invalidateClientMemory(`calendar-remainder:${todayIso}`);
    const frame = requestAnimationFrame(() => void loadRemainder());
    return () => {
      generation.current += 1;
      cancelAnimationFrame(frame);
    };
  }, [enabled, loadRemainder, publish, todayIso]);

  const ensureMonth = useCallback((month: string): Promise<boolean> => {
    if (windows.current.has(month)) return Promise.resolve(true);
    const existing = requests.current.get(month);
    if (existing) return existing;
    const version = generation.current;
    setMonths((current) => ({ ...current, [month]: "loading" }));
    const request = (async () => {
      try {
        // Deduplicate within this server seed, but recheck after every refresh.
        // A remembered month must not preserve an unfollowed/private class.
        const result = await withTimeout(loadFollowingCalendarMonth(month));
        if (version !== generation.current) return false;
        if (!result) throw new Error("Calendar unavailable");
        windows.current.set(month, result);
        publish();
        setMonths((current) => ({ ...current, [month]: "loaded" }));
        return true;
      } catch {
        if (version === generation.current) setMonths((current) => ({ ...current, [month]: "error" }));
        return false;
      } finally {
        if (version === generation.current) requests.current.delete(month);
      }
    })();
    requests.current.set(month, request);
    return request;
  }, [publish, todayIso]);

  return { ...data, pending, error, months, loadedThrough, ensureMonth, retry: loadRemainder };
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
