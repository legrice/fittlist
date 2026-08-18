"use client";

import { ClassOpener } from "@/components/ClassOpener";
import { CalendarList, type WeekDayRows } from "@/components/WeekView";
import type { DirClass } from "@/lib/discoverclasses";

/** One day, one band: the grouped shape every schedule in the app takes.
 *  It lives here rather than beside DirClass because this is the only thing
 *  that groups them, and `discoverclasses` reaches the database: importing a
 *  value from it into a client component drags pg into the browser bundle. */
function groupClassDays(classes: DirClass[]): { iso: string; items: DirClass[] }[] {
  const byIso = new Map<string, DirClass[]>();
  for (const c of classes) {
    const arr = byIso.get(c.iso) ?? [];
    arr.push(c);
    byIso.set(c.iso, arr);
  }
  return [...byIso.entries()].map(([iso, items]) => ({ iso, items }));
}

/** "Today, Aug 9", then the date: the same words Home's bands use. */
function bandLabel(iso: string, today: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (iso === today) return `Today, ${md}`;
  const wd = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  return `${wd}, ${md}`;
}

/**
 * A list of dated class occurrences, in Home's own list grammar, by Matt's
 * call: the banded days and the flat rows, so Search's Classes segment and
 * the screen it came from read as one app. Search draws it, and anything
 * else that lists occurrences should draw it too rather than a second copy.
 */
export function ClassResults({
  classes,
  todayIso,
  from,
}: {
  classes: DirClass[];
  todayIso: string;
  from: "discover" | "search";
}) {
  const days:WeekDayRows[] = groupClassDays(classes).map((day) => ({
    iso: day.iso,
    label: bandLabel(day.iso, todayIso),
    today: day.iso === todayIso,
    rows: day.items.map((c) => ({
      key: `${c.classId}|${c.iso}`,
      name: c.name,
      where: c.where,
      hm: c.hm,
      ap: c.ap,
      coach: c.coachName ? { id:c.classId, name:c.coachName, color:c.coachColor, photo:c.coachPhoto } : null,
      href: `/${c.base}/${c.classId}?d=${c.iso}&from=${from}`,
      classId: c.classId,
      iso: c.iso,
      base: c.base,
    })),
  }));
  return (
    <ClassOpener handle="">
      <CalendarList days={days} />
    </ClassOpener>
  );
}
