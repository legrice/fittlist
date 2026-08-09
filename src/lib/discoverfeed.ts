import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { hiddenFrom } from "@/lib/blocks";
import { classAddress, publicSchedules } from "@/lib/coachweek";
import { clockParts, occurrenceEnded, runsOn, timeToMinutes, todayIso, WEEKS_AHEAD, weekDates } from "@/lib/format";
import type { FeedCoach, FeedItem } from "@/components/FollowingScreen";

// The Discover feed, built once for everything that shows it: the tab's
// page, and the Add screen's browse list. Classes near you from every
// listable coach, deduped to one row per class, with the favorites rail
// and the category pills derived from the same pass.

export type DiscoverFeed = {
  items: FeedItem[];
  rail: FeedCoach[];
  favIds: string[];
  cats: string[];
  follows: number;
  today: string;
};

export async function buildDiscoverFeed(
  userId: string,
  me: { email: string; kind: string; handle: string | null },
): Promise<DiscoverFeed> {
  const db = await getDb();
  // By email, the way every other follow lookup does it: somebody who followed
  // before signing in still counts once the address has an account.
  const [followRows, hidden] = await Promise.all([
    db
      .select({ trainerUserId: schema.subscribers.trainerUserId })
      .from(schema.subscribers)
      .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt))),
    hiddenFrom(userId),
  ]);
  const followed = followRows
    .map((r) => r.trainerUserId)
    .filter((id) => id !== userId && !hidden.has(id));
  // Discover, per the brief: the list is classes near you, from every
  // listable coach, whether or not anybody favorited them. A favorite is a
  // shortcut to a person (the rail on top), not a subscription that fills
  // this feed; the feed is full on day one because it never waited on one.
  // Delisted (discoverable off) and blocked stay out; your own classes ride
  // along because they are also near you, and true.
  const everyoneRows = await db
    .select()
    .from(schema.users)
    .where(and(isNotNull(schema.users.handle), eq(schema.users.discoverable, true)));
  const coachRows = everyoneRows.filter(
    (u) => u.kind !== "fan" && u.kind !== "gym" && (u.id === userId || !hidden.has(u.id)),
  );
  // The same loader the coach's own page and the digests ask, so following
  // somebody shows the week their page shows and not a shorter one.
  const allClassRows = coachRows.length ? await publicSchedules(coachRows) : [];
  const classRows = allClassRows.filter((c) => c.isPublic);
  const coaches = coachRows.filter((c) => !!c.handle);
  const coachById = new Map(coaches.map((c) => [c.id, c]));

  const studioIds = [...new Set(classRows.map((c) => c.studioId))].filter(
    (id): id is string => !!id,
  );
  const studioRows = studioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds))
    : [];
  const studioById = new Map(studioRows.map((s) => [s.id, s]));

  const today = todayIso();
  const items: FeedItem[] = [];
  for (let w = 0; w <= WEEKS_AHEAD; w++) {
    for (const iso of weekDates(w, today)) {
      const d = new Date(`${iso}T00:00:00Z`);
      const dow = (d.getUTCDay() + 6) % 7;
      for (const c of classRows) {
        if (!runsOn(c, iso, dow)) continue;
        // Been and gone is not an answer to "when can I train next".
        if (occurrenceEnded(iso, c.startTime, c.durationMin)) continue;
        // A shift is owned by the gym and shown under the coach, so the person
        // this row is about is ownerUserId, never userId.
        const coach = coachById.get(c.ownerUserId);
        if (!coach?.handle) continue;
        const st = c.studioId ? studioById.get(c.studioId) : undefined;
        const at = classAddress(c, coach.handle, st?.slug);
        if (!at) continue;
        const t = clockParts(c.startTime);
        items.push({
          key: `${c.id}|${iso}`,
          week: w,
          iso,
          classId: c.id,
          base: at.key,
          coachId: coach.id,
          name: c.name,
          where: st?.name ?? c.location ?? null,
          // A studio has a page; a class's own free-text location names a
          // room, which has nothing to open.
          whereHref: st ? `/s/${st.slug}` : null,
          hm: t.hm,
          ap: t.ap,
          durationMin: c.durationMin,
          mins: timeToMinutes(c.startTime),
          about: c.description ?? null,
          classType: c.classType ?? null,
          links: c.links,
          studioAddress: st?.address ?? null,
        });
      }
    }
  }

  // One class, one row, however many accounts list it. A studio's listing
  // and the coach's own, or two coaches co-listing a slot, are the same
  // class in the reader's terms: same name, same start, same place, same
  // day. Discover is a reader's list, so the duplicate collapses here and
  // the first row in wins (the loop walks coaches in a stable order). The
  // pairing publicSchedules does covers gym-vs-coach per person; this is
  // the reader-side net for everything that slips past it.
  {
    const seen = new Set<string>();
    let w = 0;
    for (const i of items) {
      const key = `${i.iso}|${i.name.trim().toLowerCase()}|${i.mins}|${(i.where ?? "").toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items[w++] = i;
    }
    items.length = w;
  }

  // Soonest first. The rail was alphabetical, which is an order about the
  // names rather than about the week: whoever is teaching in an hour was
  // wherever the alphabet put them, and a rail is read left to right with only
  // its first few faces seen without a swipe. So the face in front is the one
  // with the nearest class, and the question "who can I train with next" is
  // answered by the order itself.
  //
  // Keyed on the date and the time together, because `mins` alone would put
  // next Monday's 6am ahead of tonight's 6pm. A coach with nothing in the
  // three weeks sorts last and is dropped by the rail anyway; they keep the
  // alphabet among themselves so the tail is at least stable.
  const soonest = new Map<string, string>();
  for (const i of items) {
    const at = `${i.iso}T${String(i.mins).padStart(4, "0")}`;
    const had = soonest.get(i.coachId);
    if (!had || at < had) soonest.set(i.coachId, at);
  }
  // The rail is the favorites alone, soonest class first, each face
  // carrying when that class is: the rail answers "who can I train with
  // next" before a single tap.
  const favSet = new Set(followed);
  const nextLabel = (id: string): string | null => {
    const at = soonest.get(id);
    if (!at) return null;
    const iso = at.slice(0, 10);
    const item = items.find((i) => i.coachId === id && i.iso === iso);
    if (!item) return null;
    const day =
      iso === today
        ? "Today"
        : new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
            weekday: "short",
            timeZone: "UTC",
          });
    return `${day} ${item.hm}${item.ap.toLowerCase()}`;
  };
  const rail: FeedCoach[] = coaches
    .map((c) => ({
      id: c.id,
      name: c.name.trim() || c.email.split("@")[0],
      handle: c.handle!,
      photo: c.photoThumb ?? c.photo,
      color: avatarColor(c),
      next: nextLabel(c.id),
    }))
    .sort((a, b) => {
      const x = soonest.get(a.id);
      const y = soonest.get(b.id);
      if (x && y && x !== y) return x < y ? -1 : 1;
      if (x && !y) return -1;
      if (!x && y) return 1;
      return a.name.localeCompare(b.name);
    });

  // The category pills, from what the fortnight actually holds: a filter is
  // only offered where it can narrow something.
  const catCount = new Map<string, number>();
  for (const i of items) if (i.classType) catCount.set(i.classType, (catCount.get(i.classType) ?? 0) + 1);
  const cats = [...catCount.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);

  return { items, rail, favIds: [...favSet], cats, follows: followed.length, today };
}
