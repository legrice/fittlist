"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { currentAdmin } from "@/lib/admin";
import { knownLocations } from "@/app/actions/locations";
import { avatarColor } from "@/lib/avatar";
import { hiddenFrom } from "@/lib/blocks";
import { fmtTime, siteOrigin } from "@/lib/format";
import { floatingEnd, floatingStart } from "@/lib/ics";
import { normalizeLocation } from "@/lib/location";
import { mutualIds } from "@/lib/mutuals";
import { addNotification } from "@/lib/notify";
import { getSessionUserId } from "@/lib/session";

export type EventInput = {
  name: string;
  startDate: string; // ISO
  endDate?: string | null; // ISO; empty = one day
  startTime?: string | null; // "HH:MM" 24h; empty = all day
  place: string;
  city?: string | null;
  photo?: string | null; // small data URL, same shape as every other photo
  description?: string | null;
  link?: string | null;
  hostName?: string | null;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const WD_S = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MO_S = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (isoDay: string) => {
  const d = new Date(`${isoDay}T00:00:00Z`);
  return `${WD_S[(d.getUTCDay() + 6) % 7]}, ${MO_S[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

export type EventDetail = {
  id: string;
  name: string;
  photo: string | null;
  /** The full when: one day with its time, or the range. */
  whenLabel: string;
  /** Just the start day, for the invite sentence. */
  startLabel: string;
  place: string;
  city: string | null;
  host: string;
  posterName: string | null;
  posterHandle: string | null;
  description: string | null;
  link: string | null;
  shareUrl: string;
  googleUrl: string;
  canGo: boolean;
  going: boolean;
  isPoster: boolean;
  canRemove: boolean;
  myCompanions: string[];
  myHandle: string | null;
  /** The room: the poster's list, or a goer's list minus themselves. Null
   *  means this viewer doesn't get to look. */
  faces:
    | { name: string; photo: string | null; color: string; handle: string | null; companions: string[] }[]
    | null;
};

// What the event overlay needs, in one round trip. The same data the page at
// /e/{id} renders, without the chrome, so tapping a poster on the board keeps
// you on the board.
export async function eventDetail(id: string): Promise<EventDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await getDb();
  const [ev] = await db.select().from(schema.events).where(eq(schema.events.id, id));
  if (!ev) return null;

  const viewerId = await getSessionUserId();
  const admin = viewerId ? await currentAdmin() : null;
  const isPoster = !!viewerId && viewerId === ev.createdByUserId;

  const markRows = await db
    .select({
      userId: schema.eventAttendances.userId,
      companions: schema.eventAttendances.companions,
    })
    .from(schema.eventAttendances)
    .where(eq(schema.eventAttendances.eventId, ev.id));
  const companionsByUser = new Map(markRows.map((m) => [m.userId, m.companions]));
  const going = !!viewerId && markRows.some((m) => m.userId === viewerId);

  let myHandle: string | null = null;
  if (viewerId) {
    const [v] = await db
      .select({ handle: schema.users.handle })
      .from(schema.users)
      .where(eq(schema.users.id, viewerId));
    myHandle = v?.handle ?? null;
  }

  // The room, priced the same as everywhere: the poster sees their list, a
  // goer sees the others, and nobody else sees anything at all.
  let faces: EventDetail["faces"] = null;
  if (viewerId && (going || isPoster)) {
    let ids = [...new Set(markRows.map((m) => m.userId))];
    if (!isPoster) {
      const hidden = await hiddenFrom(viewerId);
      ids = ids.filter((x) => x !== viewerId && !hidden.has(x));
    }
    const people = ids.length
      ? await db.select().from(schema.users).where(inArray(schema.users.id, ids))
      : [];
    faces = people
      .map((p) => ({
        name: p.name.trim() || p.email.split("@")[0],
        photo: p.photo,
        color: avatarColor(p),
        handle: p.handle,
        companions: companionsByUser.get(p.id) ?? [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const poster = ev.createdByUserId
    ? (
        await db
          .select({ name: schema.users.name, handle: schema.users.handle })
          .from(schema.users)
          .where(eq(schema.users.id, ev.createdByUserId))
      )[0]
    : undefined;

  const multi = ev.endDate !== ev.startDate;
  const whenLabel = multi
    ? `${dayLabel(ev.startDate)} to ${dayLabel(ev.endDate)}`
    : `${dayLabel(ev.startDate)}${ev.startTime ? ` · ${fmtTime(ev.startTime)}` : ""}`;

  // Google gets a template link: an hour for a timed event, all-day (end
  // exclusive) otherwise. No .ics endpoint for events yet, so one door.
  const pageUrl = `${siteOrigin()}/e/${ev.id}`;
  const ymd = (iso: string) => iso.replaceAll("-", "");
  const dayAfter = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  const gcalParams = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.name,
    dates: ev.startTime
      ? `${floatingStart(ev.startDate, ev.startTime)}/${floatingEnd(ev.startDate, ev.startTime, 60)}`
      : `${ymd(ev.startDate)}/${ymd(dayAfter(ev.endDate))}`,
    details: ev.link ? `${ev.link}\n\n${pageUrl}` : pageUrl,
    location: ev.place,
  });

  return {
    id: ev.id,
    name: ev.name,
    photo: ev.photo,
    whenLabel,
    startLabel: dayLabel(ev.startDate),
    place: ev.place,
    city: ev.city,
    host: ev.hostName?.trim() || poster?.name || "",
    posterName: poster?.name ?? null,
    posterHandle: poster?.handle ?? null,
    description: ev.description,
    link: ev.link,
    shareUrl: pageUrl,
    googleUrl: `https://calendar.google.com/calendar/render?${gcalParams.toString()}`,
    canGo: !!viewerId && !isPoster,
    going,
    isPoster,
    canRemove: isPoster || !!admin,
    myCompanions: (viewerId && companionsByUser.get(viewerId)) || [],
    myHandle,
    faces,
  };
}

// Post a community event. Coaches only, by kind: members' things stay private
// by construction everywhere else, and an open events board is the same wall.
export async function createEvent(
  input: EventInput,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const db = await getDb();
  const [me] = await db
    .select({ kind: schema.users.kind })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me || me.kind === "fan") return { ok: false, error: "Only coaches can post an event." };

  const name = input.name.trim();
  const place = input.place.trim();
  if (!name) return { ok: false, error: "Give the event a name." };
  if (!place) return { ok: false, error: "Say where it is." };
  if (!ISO_DAY.test(input.startDate)) return { ok: false, error: "Pick a date." };
  const endDate = input.endDate?.trim() || input.startDate;
  if (!ISO_DAY.test(endDate) || endDate < input.startDate)
    return { ok: false, error: "The end date can't come before the start." };
  if (input.photo && (!input.photo.startsWith("data:image/") || input.photo.length > 900_000))
    return { ok: false, error: "That image didn't work. Try a smaller one." };
  const link = input.link?.trim() || null;
  if (link && !/^https?:\/\//.test(link))
    return { ok: false, error: "The link needs to start with http." };

  // Same canonical city strings Discover already groups by.
  const city = input.city?.trim()
    ? await (async () => {
        const norm = normalizeLocation(input.city!.trim(), await knownLocations());
        return norm.ok ? norm.value : input.city!.trim();
      })()
    : null;

  const [row] = await db
    .insert(schema.events)
    .values({
      name,
      startDate: input.startDate,
      endDate,
      startTime: input.startTime?.trim() || null,
      place,
      city,
      photo: input.photo || null,
      description: input.description?.trim() || null,
      link,
      hostName: input.hostName?.trim() || null,
      createdByUserId: userId,
    })
    .returning();
  revalidatePath("/discover");
  return { ok: true, id: row.id };
}

// The poster can take their event down; so can the admin. No edit for now:
// delete and repost covers a beta, and a second sheet is scope the feature
// hasn't earned.
export async function deleteEvent(id: string): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const db = await getDb();
  const [ev] = await db.select().from(schema.events).where(eq(schema.events.id, id));
  if (!ev) return { ok: false, error: "Event not found." };
  const admin = await currentAdmin();
  if (ev.createdByUserId !== userId && !admin)
    return { ok: false, error: "Only the poster can remove this." };
  await db.delete(schema.eventAttendances).where(eq(schema.eventAttendances.eventId, id));
  await db.delete(schema.events).where(eq(schema.events.id, id));
  revalidatePath("/discover");
  return { ok: true };
}

// Going, on the events board. Any signed-in person; the marker's mutuals get
// told, because "your friend is going" is exactly the reason people show up.
// Mutuals only, as everywhere: a one-way follow surfaces nothing.
export async function setEventGoing(
  eventId: string,
  on: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Log in first." };
  const db = await getDb();
  const [ev] = await db.select().from(schema.events).where(eq(schema.events.id, eventId));
  if (!ev) return { ok: false, error: "Event not found." };

  if (!on) {
    await db
      .delete(schema.eventAttendances)
      .where(
        and(
          eq(schema.eventAttendances.eventId, eventId),
          eq(schema.eventAttendances.userId, userId),
        ),
      );
    revalidatePath(`/e/${eventId}`);
    return { ok: true };
  }

  const inserted = await db
    .insert(schema.eventAttendances)
    .values({ eventId, userId })
    .onConflictDoNothing({
      target: [schema.eventAttendances.eventId, schema.eventAttendances.userId],
    })
    .returning({ id: schema.eventAttendances.id });
  // Only a real insert rings bells, and the dedupe keeps a remove-and-re-add
  // quiet the second time.
  if (inserted.length) {
    try {
      const mutuals = await mutualIds(userId);
      if (mutuals.size) {
        const [me] = await db
          .select({ name: schema.users.name, email: schema.users.email })
          .from(schema.users)
          .where(eq(schema.users.id, userId));
        const myName = me?.name.trim() || me?.email.split("@")[0] || "Someone";
        const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const d = new Date(`${ev.startDate}T00:00:00Z`);
        const when = `${WD[(d.getUTCDay() + 6) % 7]}, ${MO[d.getUTCMonth()]} ${d.getUTCDate()}`;
        const body = [when, ev.place].filter(Boolean).join(" · ");
        for (const mid of mutuals) {
          // Keyed on the href (unique per event): two events can share a
          // date and place, but not a page.
          const [dupe] = await db
            .select({ id: schema.notifications.id })
            .from(schema.notifications)
            .where(
              and(
                eq(schema.notifications.userId, mid),
                eq(schema.notifications.type, "event_going"),
                eq(schema.notifications.actorUserId, userId),
                eq(schema.notifications.href, `/e/${eventId}`),
              ),
            );
          if (dupe) continue;
          await addNotification(mid, {
            type: "event_going",
            title: `${myName} is going to ${ev.name}`,
            body,
            href: `/e/${eventId}`,
            actorUserId: userId,
          });
        }
      }
    } catch (err) {
      console.error("event-going notification failed", err);
    }
  }
  revalidatePath(`/e/${eventId}`);
  return { ok: true };
}

// "With Joanne and Dave" on an event mark. Same cleaning, same scoping.
export async function setEventCompanions(
  eventId: string,
  namesRaw: string[],
): Promise<{ ok: boolean; error?: string; companions?: string[] }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Log in first." };
  const seen = new Set<string>();
  const companions: string[] = [];
  for (const r of Array.isArray(namesRaw) ? namesRaw : []) {
    const name = r.trim().slice(0, 40);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    companions.push(name);
    if (companions.length >= 10) break;
  }
  const db = await getDb();
  const updated = await db
    .update(schema.eventAttendances)
    .set({ companions })
    .where(
      and(
        eq(schema.eventAttendances.eventId, eventId),
        eq(schema.eventAttendances.userId, userId),
      ),
    )
    .returning({ id: schema.eventAttendances.id });
  if (!updated.length) return { ok: false, error: "Mark yourself going first." };
  revalidatePath(`/e/${eventId}`);
  return { ok: true, companions };
}
