import { avatarColor } from "@/lib/avatar";
import { classAddress, type ScheduleRow } from "@/lib/coachweek";
import { clockParts, occurrenceEnded, runsOn, timeToMinutes, todayIso } from "@/lib/format";
import type { schema } from "@/db";

// The classes half of the directory: every public class anyone can walk into,
// as dated occurrences rather than as rows in a table. It is the one half
// that answers "what can I do on Thursday", which is a different question
// from "who teaches near me" and was the reason people opened the app.
//
// The window is a fortnight, loaded once. Every filter the screen offers
// (today, tomorrow, the weekend, seven days, fourteen) is a slice of it, so
// picking one is instant and nothing round-trips. That is a beta-scale
// decision, and it is the same ceiling search hit before it moved to the
// server: a fortnight of every class in a city is fine while a city means a
// dozen coaches, and stops being fine well before it stops working. When it
// bites, this becomes an action that takes the range and queries it.
export const DISCOVER_DAYS = 14;

export type DirClass = {
  /** The class row and the date it runs: a weekly class is many of these. */
  classId: string;
  iso: string;
  name: string;
  classType: string | null;
  hm: string;
  ap: string;
  /** Minutes from midnight, for sorting a day's rows. */
  at: number;
  durationMin: number;
  coachName: string | null;
  coachPhoto: string | null;
  coachColor: string;
  studioName: string | null;
  where: string | null;
  /** Search/filter location. A studio address when attached, otherwise the
   *  class's own location. Kept off the row UI; it only answers where. */
  location: string;
  /** The URL base the class page lives under: a handle, or s/{slug}. */
  base: string;
  /** Already in this viewer's plans. */
  added: boolean;
  /** Theirs to teach, so the ribbon has nothing to offer. */
  mine: boolean;
};

type DiscoverOwner = Pick<
  typeof schema.users.$inferSelect,
  "id" | "kind" | "handle" | "discoverable" | "name" | "photo" | "avatarColor"
>;
type DiscoverStudio = Pick<
  typeof schema.studios.$inferSelect,
  "id" | "slug" | "name" | "address"
>;
type DiscoverScheduleRow = Omit<ScheduleRow, "image">;
type DiscoverGymRow = Omit<typeof schema.classes.$inferSelect, "image">;

/**
 * Whether a class answers a search.
 *
 * It reads the class's own words and nothing borrowed from whoever teaches
 * it: a coach and a studio have their own sections on that screen, so
 * matching a class by its coach's name would be the same answer twice under
 * two headings.
 *
 * The name and the type match anywhere in them, the description only at the
 * start of a word, and the split is the difference between the two kinds of
 * text. A name is short and chosen, so a substring of one is very nearly
 * always the thing you meant. A description is prose, and in prose a short
 * needle lands inside words that have nothing to do with it: searching "om"
 * for a yoga studio returned every class whose description said "room" or
 * "welcome".
 */
export function classMatches(
  c: { name: string; classType: string | null; description: string | null },
  needle: string,
): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return false;
  if (`${c.name} ${c.classType ?? ""}`.toLowerCase().includes(q)) return true;
  const words = ` ${(c.description ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ")}`;
  return words.includes(` ${q.replace(/[^a-z0-9]+/g, " ")}`);
}

/**
 * Every listable class occurrence in the next fortnight, in time order.
 *
 * Listable means what it means everywhere else in the directory: public,
 * from somebody who hasn't delisted themselves, nobody either of you has
 * blocked, and not already been and gone. A gym's own rota counts too, and
 * it has no handle, so the row carries the base its page lives under rather
 * than assuming a person.
 *
 * This queries nothing. The directory page already loads every row it needs
 * for the coaches and the studios, and the classes are the same rows read a
 * different way: when this fetched its own, `/discover` ran `publicSchedules`
 * twice, scanned the users twice and loaded the studios twice to draw one
 * screen. Anything calling this passes what it already has.
 */
export function buildDiscoverClasses(input: {
  viewerId: string;
  /** Every user row, gyms included: a gym owns classes and has no handle. */
  owners: DiscoverOwner[];
  hidden: Set<string>;
  /** `publicSchedules()` over the listable people, already run. */
  personRows: DiscoverScheduleRow[];
  /** The gyms' own public classes, straight off the table. */
  gymRows: DiscoverGymRow[];
  studios: DiscoverStudio[];
  /** The viewer's future marks, for the ribbon's starting state. */
  marks: { classId: string; occurrenceDate: string }[];
}): DirClass[] {
  const { viewerId, owners, hidden, personRows, gymRows, studios, marks } = input;
  const today = todayIso();
  // A coach who is delisted keeps their page and leaves the directory, so
  // their classes leave it too: a listing they opted out of is still a
  // listing. A gym account has no handle and no such switch; its schedule is
  // the thing it published.
  const ownerById = new Map(
    owners
      .filter((u) => !hidden.has(u.id) && (u.kind === "gym" ? true : !!u.handle && u.discoverable))
      .map((u) => [u.id, u]),
  );
  const rows = [
    ...personRows.filter((c) => c.isPublic),
    // The gym rows come off the table raw, so they carry no shift shape; a
    // gym's class is owned by the gym and shown under the studio either way.
    ...gymRows.map((c) => ({ ...c, ownerUserId: c.userId, shift: false as const, duplicateOf: null })),
  ];
  const studioById = new Map(studios.map((s) => [s.id, s]));
  const added = new Set(marks.map((m) => `${m.classId}|${m.occurrenceDate}`));

  const out: DirClass[] = [];
  const start = new Date(`${today}T00:00:00Z`);
  for (let i = 0; i < DISCOVER_DAYS; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dow = (d.getUTCDay() + 6) % 7;
    for (const c of rows) {
      if (!runsOn(c, iso, dow)) continue;
      // A class that has been and gone is off every schedule, and a directory
      // of things you can go to is the strongest case for that rule.
      if (occurrenceEnded(iso, c.startTime, c.durationMin)) continue;
      const owner = ownerById.get(c.ownerUserId);
      if (!owner) continue;
      const studio = c.studioId ? studioById.get(c.studioId) : undefined;
      const at = classAddress(c, owner.handle, studio?.slug);
      // A gym's class has no handle behind it; the studio's page is its
      // address, and without one there is nowhere for the row to go.
      const base =
        owner.kind === "gym" ? (studio?.slug ? `s/${studio.slug}` : null) : (at?.base ?? null);
      if (!base) continue;
      const t = clockParts(c.startTime);
      out.push({
        classId: c.id,
        base,
        iso,
        name: c.name,
        classType: c.classType,
        hm: t.hm,
        ap: t.ap,
        at: timeToMinutes(c.startTime),
        durationMin: c.durationMin,
        coachName: owner.kind === "gym" ? null : owner.name,
        coachPhoto: owner.kind === "gym" ? null : owner.photo,
        coachColor: avatarColor(owner),
        studioName: studio?.name ?? null,
        where: studio ? studio.name : c.location,
        location: studio?.address ?? c.location ?? "",
        added: added.has(`${c.id}|${iso}`),
        mine: c.userId === viewerId || c.coachUserId === viewerId,
      });
    }
  }
  out.sort((a, b) => a.iso.localeCompare(b.iso) || a.at - b.at || a.name.localeCompare(b.name));
  return out;
}
