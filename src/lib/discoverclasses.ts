import { and, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { hiddenFrom } from "@/lib/blocks";
import { classAddress, publicSchedules } from "@/lib/coachweek";
import { clockParts, occurrenceEnded, runsOn, timeToMinutes, todayIso } from "@/lib/format";

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
  /** The URL base the class page lives under: a handle, or s/{slug}. */
  base: string;
  /** Already in this viewer's plans. */
  added: boolean;
  /** Theirs to teach, so the ribbon has nothing to offer. */
  mine: boolean;
};

/**
 * Every listable class occurrence in the next fortnight, in time order.
 *
 * Listable means what it means everywhere else in the directory: public,
 * from somebody who hasn't delisted themselves, nobody either of you has
 * blocked, and not already been and gone. A gym's own rota counts too, and
 * it has no handle, so the row carries the base its page lives under rather
 * than assuming a person.
 */
export async function discoverClasses(viewerId: string): Promise<DirClass[]> {
  const db = await getDb();
  const today = todayIso();
  const [owners, hidden, marks] = await Promise.all([
    db.select().from(schema.users),
    hiddenFrom(viewerId),
    db
      .select({
        classId: schema.attendances.classId,
        occurrenceDate: schema.attendances.occurrenceDate,
      })
      .from(schema.attendances)
      .where(and(eq(schema.attendances.userId, viewerId), gte(schema.attendances.occurrenceDate, today))),
  ]);
  // A coach who is delisted keeps their page and leaves the directory, so
  // their classes leave it too: a listing they opted out of is still a
  // listing. A gym account has no handle and no such switch; its schedule is
  // the thing it published.
  const listable = owners.filter(
    (u) => !hidden.has(u.id) && (u.kind === "gym" ? true : !!u.handle && u.discoverable),
  );
  const ownerById = new Map(listable.map((u) => [u.id, u]));

  // The people's own classes plus the shifts each chose to show, from the one
  // loader every public surface uses, and the gyms' rotas beside them.
  const people = listable.filter((u) => u.kind !== "gym");
  const gymIds = listable.filter((u) => u.kind === "gym").map((u) => u.id);
  const [personRows, gymRows] = await Promise.all([
    publicSchedules(people),
    gymIds.length
      ? db
          .select()
          .from(schema.classes)
          .where(and(inArray(schema.classes.userId, gymIds), eq(schema.classes.isPublic, true)))
      : Promise.resolve([]),
  ]);
  const rows = [
    ...personRows.filter((c) => c.isPublic),
    // The gym rows come off the table raw, so they carry no shift shape; a
    // gym's class is owned by the gym and shown under the studio either way.
    ...gymRows.map((c) => ({ ...c, ownerUserId: c.userId, shift: false as const, duplicateOf: null })),
  ];

  const studioIds = [...new Set(rows.map((c) => c.studioId))].filter((id): id is string => !!id);
  const studios = studioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds))
    : [];
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
        base,
        added: added.has(`${c.id}|${iso}`),
        mine: c.userId === viewerId || c.coachUserId === viewerId,
      });
    }
  }
  out.sort((a, b) => a.iso.localeCompare(b.iso) || a.at - b.at || a.name.localeCompare(b.name));
  return out;
}
