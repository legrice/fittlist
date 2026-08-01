"use server";

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { hiddenFrom } from "@/lib/blocks";
import { publicSchedules } from "@/lib/coachweek";
import { fansVisible } from "@/lib/flags";
import { runsOn, todayIso } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import type { DirPerson, DirStudio } from "@/components/DirectoryRows";

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

export async function searchAll(
  query: string,
): Promise<{ people: DirPerson[]; studios: DirStudio[] }> {
  const empty = { people: [] as DirPerson[], studios: [] as DirStudio[] };
  const userId = await getSessionUserId();
  if (!userId) return empty;
  if (!(await fansVisible())) return empty;
  const needle = query.trim().toLowerCase();
  if (needle.length < MIN) return empty;

  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return empty;

  const [allRows, hidden, followRows, askRows, studioRows] = await Promise.all([
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
    db.select().from(schema.studios).orderBy(schema.studios.name),
  ]);

  // A handle, a name, or the city they train in. The handle is in there
  // because it's what people are handed on a card, and typing it should find
  // the person rather than nothing.
  const matched = allRows
    .filter((r) => !hidden.has(r.id) && r.id !== userId && r.name.trim())
    .filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        (r.handle ?? "").toLowerCase().includes(needle) ||
        (r.title ?? "").toLowerCase().includes(needle) ||
        (r.location ?? "").toLowerCase().includes(needle),
    );

  // Only for the people who matched, so the count on a row still means what it
  // does on Discover without loading every schedule to say it.
  const classRows = (await publicSchedules(matched)).filter((c) => c.isPublic);
  const start = new Date(`${todayIso()}T00:00:00Z`);
  const weekCount = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dow = (d.getUTCDay() + 6) % 7;
    for (const c of classRows) {
      if (runsOn(c, iso, dow)) weekCount.set(c.ownerUserId, (weekCount.get(c.ownerUserId) ?? 0) + 1);
    }
  }

  const following = new Set(followRows.map((r) => r.trainerUserId));
  const requested = new Set(askRows.map((r) => r.trainerUserId));
  // The closest match first: a name that starts with what you typed is almost
  // always the one you meant, and everything else keeps its name order.
  const rank = (name: string) => (name.toLowerCase().startsWith(needle) ? 0 : 1);
  const people: DirPerson[] = matched
    .map((r) => ({
      id: r.id,
      handle: r.handle!,
      name: r.name,
      kind: (r.kind === "fan" ? "member" : "coach") as "coach" | "member",
      photo: r.photo,
      title: r.title ?? "",
      location: r.location?.trim() ?? "",
      classesThisWeek: weekCount.get(r.id) ?? 0,
      following: following.has(r.id),
      requested: requested.has(r.id),
      availability: r.kind === "fan" ? null : r.availability,
      disciplines: r.disciplines,
      color: avatarColor(r),
    }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));

  const studios: DirStudio[] = studioRows
    .filter(
      (st) =>
        st.name.toLowerCase().includes(needle) ||
        st.address.toLowerCase().includes(needle) ||
        st.types.some((t) => t.toLowerCase().includes(needle)),
    )
    .map((st) => ({
      id: st.id,
      slug: st.slug ?? st.id,
      name: st.name,
      address: st.address,
      photo: st.photo,
      types: st.types,
      hasSchedule: !!st.accountUserId,
      color: avatarColor({ id: st.id }),
    }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));

  return { people, studios };
}
