"use server";

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { fmtDateLong, fmtTime, occurrenceEnded, runsOn, siteOrigin, todayIso } from "@/lib/format";
import { avatarColor } from "@/lib/avatar";
import { isBlocked } from "@/lib/blocks";
import { fansVisible } from "@/lib/flags";
import { getSessionUserId } from "@/lib/session";
import { studioPath } from "@/lib/studio";

// What the class sheet needs, in one round trip.
//
// The sheet and the full page show the same class; the page stays, because a
// link someone was sent has to open something real. This is the same data
// without the chrome, so tapping a row in a list keeps you in the list.

export type ClassDetail = {
  id: string;
  handle: string;
  coachName: string;
  coachPhoto: string | null;
  coachColor: string;
  name: string;
  classType: string | null;
  description: string | null;
  whenIso: string;
  dateLong: string;
  time: string;
  durationMin: number;
  studioName: string | null;
  studioAddress: string | null;
  studioHref: string | null;
  location: string | null;
  links: { label: string; url: string }[];
  shareUrl: string;
  /** Whether this viewer can add it: signed in, not theirs, and public. */
  canAdd: boolean;
  added: boolean;
  /** It's been and gone: say so rather than showing a button that fails. */
  past: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function classDetail(
  handle: string,
  classId: string,
  d?: string,
): Promise<ClassDetail | null> {
  if (!UUID_RE.test(classId)) return null;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) return null;
  const [c] = await db
    .select()
    .from(schema.classes)
    .where(and(eq(schema.classes.id, classId), eq(schema.classes.userId, user.id)));
  if (!c) return null;

  const viewerId = await getSessionUserId();
  const isOwner = viewerId === user.id;
  if (!c.isPublic && !isOwner) return null;
  // Blocked: as far as they're concerned this class doesn't exist.
  if (await isBlocked(user.id, viewerId)) return null;

  const [studio] = c.studioId
    ? await db.select().from(schema.studios).where(eq(schema.studios.id, c.studioId))
    : [];

  // Same occurrence rule as the page: honour ?d= when the class actually runs
  // then, otherwise show the next date it does.
  const dowOf = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
  const asked = d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) ? d : null;
  const fits = asked ? runsOn(c, asked, dowOf(asked)) : false;
  const nextIso =
    c.specificDate ??
    (() => {
      // From today, and skipping any occurrence whose end time has gone by: a
      // link with no date on it should open on one you could still turn up to.
      // Starting at this week's Monday meant a Monday class opened on Monday
      // for the rest of the week, with no way to add it.
      const start = new Date(`${todayIso()}T00:00:00Z`);
      for (let i = 0; i < 366; i++) {
        const day = new Date(start);
        day.setUTCDate(start.getUTCDate() + i);
        const iso = day.toISOString().slice(0, 10);
        if (runsOn(c, iso, (day.getUTCDay() + 6) % 7) && !occurrenceEnded(iso, c.startTime, c.durationMin))
          return iso;
      }
      // Every occurrence is behind an end date. Fall back to today so the
      // sheet still renders something dated rather than nothing.
      return todayIso();
    })();
  const whenIso = fits ? asked! : nextIso;

  // Already run: there's nothing to add. A shared link carries its date, so an
  // old one opens on the day it named, and that day can be behind us.
  const past = occurrenceEnded(whenIso, c.startTime, c.durationMin);
  const canAdd = !isOwner && !!viewerId && c.isPublic && !past && (await fansVisible());
  let added = false;
  if (canAdd) {
    const [row] = await db
      .select({ id: schema.attendances.id })
      .from(schema.attendances)
      .where(
        and(
          eq(schema.attendances.userId, viewerId!),
          eq(schema.attendances.classId, c.id),
          eq(schema.attendances.occurrenceDate, whenIso),
        ),
      );
    added = !!row;
  }

  return {
    id: c.id,
    handle,
    coachName: user.name,
    coachPhoto: user.photo,
    coachColor: avatarColor(user),
    name: c.name,
    classType: c.classType,
    description: c.description,
    whenIso,
    dateLong: fmtDateLong(whenIso),
    time: fmtTime(c.startTime),
    durationMin: c.durationMin,
    studioName: studio?.name ?? null,
    studioAddress: studio?.address ?? null,
    studioHref: studio ? studioPath(studio) : null,
    location: c.location,
    links: c.links,
    // The date rides along, so whoever opens it lands on the occurrence you
    // were looking at rather than the next one after they tap.
    shareUrl: `${siteOrigin()}/${handle}/${c.id}?d=${whenIso}`,
    canAdd,
    added,
    past,
  };
}
