"use server";

import { and, eq, getTableColumns, gte, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { hiddenFrom } from "@/lib/blocks";
import { publicSchedules } from "@/lib/coachweek";
import { runsOn, todayIso } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import type { DirPerson, DirStudio } from "@/components/DirectoryRows";
import { buildDiscoverClasses, classMatches, type DirClass } from "@/lib/discoverclasses";

// One search across both halves of the directory: the people and the places.
//
// It runs on the server rather than filtering a list the page already shipped,
// which is what Discover does. A directory is a list you browse and it has to
// arrive whole; a search is a question, and shipping every account to every
// device so the answer can be computed there stops being reasonable long
// before it stops working.
//
// Two rules it keeps, and they are the reason this can't be a plain LIKE:
// blocked in either direction is not in the results, and `discoverable = false`
// is not either. That switch means delisted from the directory, page still
// public, and a search that ignored it would make the setting a lie. The
// Discover list's other filter (a coach needs a schedule or a bio to be worth
// opening) is deliberately *not* applied: that is a quality bar for a list
// somebody is browsing, and you asked for this person by name.

// Two characters, so a stray keystroke doesn't ask for the whole directory.
// The client holds the same number: a "use server" file can only export async
// functions, and a constant in one 500s every page that imports it.
const MIN = 2;

// How many occurrences a class search will draw. A weekly class is up to
// fourteen rows over the window, so a common word turns into a scroll nobody
// reads; the answer is the top of the list either way.
const CLASS_LIMIT = 40;

export async function searchAll(
  query: string,
  /** Narrows both halves to a place: a person's city, a studio's address.
   *  Its own field rather than words in the box, so "yoga" in "Montclair"
   *  doesn't have to share one string. Either field alone is a real search:
   *  a location by itself asks "who's here", which is a question too. */
  loc = "",
): Promise<{ people: DirPerson[]; studios: DirStudio[]; classes: DirClass[] }> {
  const empty = { people: [] as DirPerson[], studios: [] as DirStudio[], classes: [] as DirClass[] };
  const userId = await getSessionUserId();
  if (!userId) return empty;
  const needle = query.trim().toLowerCase();
  const locNeedle = loc.trim().toLowerCase();
  if (needle.length < MIN && locNeedle.length < MIN) return empty;
  return runSearch(userId, needle, locNeedle, false, false);
}

export type SearchGroup = {
  id: string;
  slug: string;
  name: string;
  photo: string | null;
  description: string | null;
};

/** Header search is direct lookup, not another Discover surface. Every result
 * must match the name it displays; proximity and related listings stay in
 * Discover where they can be understood as recommendations. */
export async function searchDirectory(query: string): Promise<{
  people: DirPerson[];
  studios: DirStudio[];
  classes: DirClass[];
  groups: SearchGroup[];
}> {
  const empty = { people: [] as DirPerson[], studios: [] as DirStudio[], classes: [] as DirClass[], groups: [] as SearchGroup[] };
  const userId = await getSessionUserId();
  const needle = query.trim().toLowerCase();
  if (!userId || needle.length < MIN) return empty;

  const db = await getDb();
  const [me] = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me) return empty;
  const pattern = `%${needle.replace(/[\\%_]/g, "\\$&")}%`;
  const { image: _classImage, ...classColumns } = getTableColumns(schema.classes);
  const [hidden, personRows, directStudioRows, classRows, followRows, askRows, groupRows, groupMemberRows, groupInviteRows] = await Promise.all([
    hiddenFrom(userId),
    db
      .select({
        id: schema.users.id,
        handle: schema.users.handle,
        name: schema.users.name,
        kind: schema.users.kind,
        photo: sql<string | null>`coalesce(${schema.users.photoThumb}, ${schema.users.photo})`.as("photo"),
        title: schema.users.title,
        location: schema.users.location,
        availability: schema.users.availability,
        disciplines: schema.users.disciplines,
        avatarColor: schema.users.avatarColor,
      })
      .from(schema.users)
      .where(and(
        isNotNull(schema.users.handle),
        eq(schema.users.discoverable, true),
        or(ilike(schema.users.name, pattern), ilike(schema.users.handle, pattern)),
      ))
      .limit(40),
    db.select({
      id: schema.studios.id,
      slug: schema.studios.slug,
      name: schema.studios.name,
      address: schema.studios.address,
      placeKind: schema.studios.placeKind,
      lat: schema.studios.lat,
      lng: schema.studios.lng,
      photo: schema.studios.photo,
      types: schema.studios.types,
      accountUserId: schema.studios.accountUserId,
    }).from(schema.studios).where(ilike(schema.studios.name, pattern)).limit(30),
    db
      .select(classColumns)
      .from(schema.classes)
      .where(and(eq(schema.classes.isPublic, true), ilike(schema.classes.name, pattern)))
      .limit(50),
    db.select({ trainerUserId: schema.subscribers.trainerUserId }).from(schema.subscribers).where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt))),
    db.select({ trainerUserId: schema.followRequests.trainerUserId }).from(schema.followRequests).where(eq(schema.followRequests.requesterUserId, userId)),
    db.select({
      id: schema.groups.id,
      slug: schema.groups.slug,
      name: schema.groups.name,
      photo: schema.groups.photo,
      description: schema.groups.description,
      visibility: schema.groups.visibility,
      ownerUserId: schema.groups.ownerUserId,
    }).from(schema.groups).where(ilike(schema.groups.name, pattern)).limit(30),
    db.select({ groupId: schema.groupMembers.groupId }).from(schema.groupMembers).where(eq(schema.groupMembers.userId, userId)),
    db.select({ groupId: schema.groupInvitations.groupId, invitedByUserId: schema.groupInvitations.invitedByUserId }).from(schema.groupInvitations).where(eq(schema.groupInvitations.inviteeUserId, userId)),
  ]);
  const following = new Set(followRows.map((row) => row.trainerUserId));
  const requested = new Set(askRows.map((row) => row.trainerUserId));
  const rank = (name: string) => (name.toLowerCase().startsWith(needle) ? 0 : 1);
  const people: DirPerson[] = personRows
    .filter((row) => row.id !== userId && !hidden.has(row.id) && row.kind !== "gym")
    .map((row) => ({
      id: row.id,
      handle: row.handle!,
      name: row.name,
      kind: row.kind === "fan" ? "member" as const : "coach" as const,
      photo: row.photo,
      title: row.title ?? "",
      location: row.location?.trim() ?? "",
      classesThisWeek: 0,
      following: following.has(row.id),
      requested: requested.has(row.id),
      availability: row.kind === "fan" ? null : row.availability,
      disciplines: row.kind === "fan" ? [] : row.disciplines,
      color: avatarColor(row),
    }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));

  // Class search expands only the rows whose displayed class name matched.
  // The old path expanded two weeks of every schedule in the directory on
  // every keystroke, then threw almost all of it away.
  const classOwnerIds = [...new Set(classRows.map((row) => row.userId))];
  const classStudioIds = [...new Set(classRows.map((row) => row.studioId).filter((id): id is string => !!id))];
  const [classOwners, classStudios, marks] = await Promise.all([
    classOwnerIds.length ? db.select({
      id: schema.users.id,
      kind: schema.users.kind,
      handle: schema.users.handle,
      discoverable: schema.users.discoverable,
      name: schema.users.name,
      photo: sql<string | null>`coalesce(${schema.users.photoThumb}, ${schema.users.photo})`.as("photo"),
      avatarColor: schema.users.avatarColor,
    }).from(schema.users).where(inArray(schema.users.id, classOwnerIds)) : [],
    classStudioIds.length ? db.select({
      id: schema.studios.id,
      slug: schema.studios.slug,
      name: schema.studios.name,
      address: schema.studios.address,
    }).from(schema.studios).where(inArray(schema.studios.id, classStudioIds)) : [],
    classRows.length ? db
      .select({ classId: schema.attendances.classId, occurrenceDate: schema.attendances.occurrenceDate })
      .from(schema.attendances)
      .where(and(
        eq(schema.attendances.userId, userId),
        inArray(schema.attendances.classId, classRows.map((row) => row.id)),
        gte(schema.attendances.occurrenceDate, todayIso()),
      )) : [],
  ]);
  const classes = buildDiscoverClasses({
    viewerId: userId,
    owners: classOwners,
    hidden,
    personRows: classRows.map((row) => ({ ...row, ownerUserId: row.userId, shift: false as const, duplicateOf: null })),
    gymRows: [],
    studios: classStudios,
    marks,
  }).slice(0, CLASS_LIMIT);
  const studios: DirStudio[] = directStudioRows
    .map((row) => ({
      id: row.id,
      slug: row.slug ?? row.id,
      name: row.name,
      address: row.address,
      placeKind: row.placeKind,
      lat: row.lat,
      lng: row.lng,
      photo: row.photo,
      types: row.types,
      hasSchedule: !!row.accountUserId,
      color: avatarColor({ id: row.id }),
    }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));

  const accessibleGroupIds = new Set([
    ...groupMemberRows.map((row) => row.groupId),
    ...groupInviteRows.filter((row) => !hidden.has(row.invitedByUserId)).map((row) => row.groupId),
  ]);
  const groups = groupRows
    .filter((row) => row.name.toLowerCase().includes(needle))
    .filter((row) => row.ownerUserId === userId || !hidden.has(row.ownerUserId))
    .filter((row) => row.visibility === "public" || row.ownerUserId === userId || accessibleGroupIds.has(row.id))
    .map((row) => ({ id: row.id, slug: row.slug, name: row.name, photo: row.photo, description: row.description }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));

  return {
    people,
    studios,
    classes,
    groups,
  };
}

/**
 * The dedicated Search screen is intentionally coaches-only. Keep these
 * focused actions separate from searchAll, which still powers the broader
 * Discover sheet, so typing a coach's name does not query studios, attendance
 * marks, and two weeks of class occurrences the screen will never render.
 */
export async function searchCoaches(query: string): Promise<DirPerson[]> {
  const userId = await getSessionUserId();
  if (!userId) return [];
  const needle = query.trim().toLowerCase();
  if (needle.length < MIN) return [];
  return (await runSearch(userId, needle, "", false, true)).people;
}

export async function browseCoaches(): Promise<DirPerson[]> {
  const userId = await getSessionUserId();
  if (!userId) return [];
  return (await runSearch(userId, "", "", true, true)).people;
}

async function runSearch(
  userId: string,
  needle: string,
  locNeedle: string,
  browse: boolean,
  peopleOnly: boolean,
): Promise<{ people: DirPerson[]; studios: DirStudio[]; classes: DirClass[] }> {
  const empty = { people: [] as DirPerson[], studios: [] as DirStudio[], classes: [] as DirClass[] };
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return empty;

  const [allRows, hidden, followRows, askRows, studioRows, coachStudioRows] = await Promise.all([
    db
      .select()
      .from(schema.users)
      .where(and(isNotNull(schema.users.handle), eq(schema.users.discoverable, true))),
    hiddenFrom(userId),
    db
      .select({ trainerUserId: schema.subscribers.trainerUserId })
      .from(schema.subscribers)
      .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt))),
    db
      .select({ trainerUserId: schema.followRequests.trainerUserId })
      .from(schema.followRequests)
      .where(eq(schema.followRequests.requesterUserId, userId)),
    peopleOnly
      ? Promise.resolve([])
      : db.select().from(schema.studios).orderBy(schema.studios.name),
    peopleOnly
      ? Promise.resolve([])
      : db.select({ userId: schema.coachStudios.userId, studioId: schema.coachStudios.studioId }).from(schema.coachStudios),
  ]);

  // A handle, a name, the city they train in, or what they teach. The handle
  // is in there because it's what people are handed on a card, and typing it
  // should find the person rather than nothing.
  //
  // `disciplines` is the one that makes a word like "kettlebell" work the
  // whole way across this screen. It is picked from `STUDIO_TYPES`, the same
  // vocabulary a studio's types come from and a class's type is offered from,
  // so one word already found the kettlebell classes and the kettlebell gyms
  // and stopped short of the kettlebell coaches, which is the half somebody
  // typing it most wants. `certifications` stays out on purpose: a credential
  // is not a category, and searching free chips for a category word only works
  // by coincidence.
  const candidates = allRows
    .filter((r) => !hidden.has(r.id) && r.id !== userId && r.kind !== "fan" && r.kind !== "gym" && r.name.trim())
    .filter((r) => !locNeedle || (r.location ?? "").toLowerCase().includes(locNeedle));
  const personMatches = (r: (typeof candidates)[number]) =>
    needle.length < MIN ||
    r.name.toLowerCase().includes(needle) ||
    (r.handle ?? "").toLowerCase().includes(needle) ||
    (r.title ?? "").toLowerCase().includes(needle) ||
    (r.location ?? "").toLowerCase().includes(needle) ||
    (r.disciplines ?? []).some((d) => d.toLowerCase().includes(needle));
  const directMatched = candidates.filter(personMatches);

  // Every listable person's schedule, once. It was the matched people only,
  // which was right when this searched names and is wrong now that it
  // searches classes: a class matches on its own words, so a Vinyasa class
  // has to be findable whether or not its coach is called Vinyasa. The same
  // rows then answer both questions, so this is one call rather than two.
  const listable = allRows.filter((r) => !hidden.has(r.id));
  // Coach Search only needs week counts for coaches it can return. The broad
  // searchAll path still needs every public schedule because it also searches
  // class inventory.
  const scheduleOwners = peopleOnly ? directMatched : listable;
  const allClassRows = (await publicSchedules(scheduleOwners)).filter((c) => c.isPublic);
  const studioMatches = (st: (typeof studioRows)[number]) =>
    needle.length < MIN ||
    st.name.toLowerCase().includes(needle) ||
    st.address.toLowerCase().includes(needle) ||
    st.types.some((t) => t.toLowerCase().includes(needle));
  const matchedStudioIds = new Set(studioRows.filter(studioMatches).map((st) => st.id));
  // A place name is also a useful way to find the people who work there.
  // Read both explicit profile associations and published schedules: either
  // one is enough to truthfully say a coach is connected to that studio.
  const studioCoachIds = new Set([
    ...coachStudioRows.filter((row) => matchedStudioIds.has(row.studioId)).map((row) => row.userId),
    ...allClassRows
      .filter((row) => !!row.studioId && matchedStudioIds.has(row.studioId))
      .map((row) => row.ownerUserId),
  ]);
  const matched = peopleOnly
    ? directMatched
    : candidates.filter((row) => personMatches(row) || studioCoachIds.has(row.id));
  const start = new Date(`${todayIso()}T00:00:00Z`);
  const weekCount = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dow = (d.getUTCDay() + 6) % 7;
    for (const c of allClassRows) {
      if (runsOn(c, iso, dow)) weekCount.set(c.ownerUserId, (weekCount.get(c.ownerUserId) ?? 0) + 1);
    }
  }

  const following = new Set(followRows.map((r) => r.trainerUserId));
  const requested = new Set(askRows.map((r) => r.trainerUserId));
  // The closest match first: a name that starts with what you typed is almost
  // always the one you meant, and everything else keeps its name order.
  const rank = (name: string) => (name.toLowerCase().startsWith(needle) ? 0 : 1);
  const people: DirPerson[] = matched
    // Browsing gets the directory's quality bar back: a coach's row on a
    // list nobody asked for has to be worth opening (a schedule, or enough
    // profile). A named search skips it, because you asked for this person.
    .filter(
      (r) =>
        !browse || !!(weekCount.get(r.id) || r.title?.trim() || r.about?.trim()),
    )
    .map((r) => ({
      id: r.id,
      handle: r.handle!,
      name: r.name,
      kind: "coach" as const,
      photo: r.photoThumb ?? r.photo,
      title: r.title ?? "",
      location: r.location?.trim() ?? "",
      classesThisWeek: weekCount.get(r.id) ?? 0,
      following: following.has(r.id),
      requested: requested.has(r.id),
      availability: r.availability,
      disciplines: r.disciplines,
      color: avatarColor(r),
    }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));

  if (peopleOnly) return { people, studios: [], classes: [] };

  // ---- the classes.
  //
  // The third section, and the one somebody actually asked for: "searchable
  // by style". A class matches on its own words (its name, its type, its
  // description), never on its coach's or its studio's, because those have
  // their own headings on this screen and matching them here would be the
  // same answer twice. That is also what makes this the cheap answer to
  // subcategories: a coach writes "Vinyasa" or "Rocket" in the words they
  // already use, and it is findable, with no vocabulary for anybody to agree
  // on and no taxonomy to file a class into. `classMatches` is where the name
  // and the description part company, and why.
  //
  // Same two rules as the halves above: a delisted coach's classes are out
  // (they own the listing they opted out of), and blocked either way is out.
  // buildDiscoverClasses already keeps both, which is why it is the thing
  // doing the work rather than a second query with the rules written again.
  //
  // The cost is honest: this expands a fortnight of every listable schedule
  // per query, which is the ceiling Discover already accepts once per page
  // load. It is fine while a city means a dozen coaches. When it bites, the
  // fix is the same one named on buildDiscoverClasses: query the range
  // instead of expanding it.
  let classes: DirClass[] = [];
  if (needle.length >= MIN || browse) {
    const gyms = await db.select().from(schema.users).where(eq(schema.users.kind, "gym"));
    const gymIds = gyms.map((g) => g.id);
    const [gymRows, marks] = await Promise.all([
      gymIds.length
        ? db
            .select()
            .from(schema.classes)
            .where(and(inArray(schema.classes.userId, gymIds), eq(schema.classes.isPublic, true)))
        : Promise.resolve([]),
      db
        .select({
          classId: schema.attendances.classId,
          occurrenceDate: schema.attendances.occurrenceDate,
        })
        .from(schema.attendances)
        .where(and(eq(schema.attendances.userId, userId), gte(schema.attendances.occurrenceDate, todayIso()))),
    ]);
    // The verdict per class row, taken before the rows are expanded into
    // occurrences: a weekly class is many occurrences and one description, and
    // matching it fourteen times is the same answer fourteen times.
    const hit = new Map<string, boolean>();
    if (!browse) {
      const owners = new Map([...listable, ...gyms].map((owner) => [owner.id, owner]));
      for (const c of [...allClassRows, ...gymRows]) {
        const ownerId = ("ownerUserId" in c ? c.ownerUserId : c.userId) as string;
        const owner = owners.get(ownerId);
        const ownerHit = !!owner && (
          owner.name.toLowerCase().includes(needle) ||
          (owner.handle ?? "").toLowerCase().includes(needle) ||
          (owner.title ?? "").toLowerCase().includes(needle)
        );
        hit.set(
          c.id,
          classMatches(c, needle) ||
            (!!c.studioId && matchedStudioIds.has(c.studioId)) ||
            ownerHit,
        );
      }
    }
    classes = buildDiscoverClasses({
      viewerId: userId,
      owners: [...listable, ...gyms],
      hidden,
      personRows: allClassRows,
      gymRows,
      studios: studioRows,
      marks,
    })
      .filter((c) => browse || hit.get(c.classId))
      // A cap, said out loud: a common word over a fortnight is a lot of
      // occurrences, and a search is an answer rather than a schedule.
      .slice(0, CLASS_LIMIT);
  }

  const studios: DirStudio[] = studioRows
    .filter(studioMatches)
    // A studio has no city column, so its address is what a place means.
    .filter((st) => !locNeedle || st.address.toLowerCase().includes(locNeedle))
    .map((st) => ({
      id: st.id,
      slug: st.slug ?? st.id,
      name: st.name,
      address: st.address,
      placeKind: st.placeKind,
      lat: st.lat,
      lng: st.lng,
      photo: st.photo,
      types: st.types,
      hasSchedule: !!st.accountUserId,
      color: avatarColor({ id: st.id }),
    }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));

  return { people, studios, classes };
}
