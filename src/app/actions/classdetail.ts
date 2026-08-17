"use server";

import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { fmtDateLong, fmtTime, occurrenceEnded, runsOn, siteOrigin, todayIso } from "@/lib/format";
import { avatarColor } from "@/lib/avatar";
import { isBlocked } from "@/lib/blocks";
import { shiftCoach, shiftNaming } from "@/lib/coachweek";
import { sendableAt, type Sendable } from "@/lib/rota";
import { floatingEnd, floatingStart, weeklyRule } from "@/lib/ics";
import { fansVisible } from "@/lib/flags";
import { currentAdmin } from "@/lib/admin";
import { getSessionUserId } from "@/lib/session";
import { studioPath } from "@/lib/studio";

// What the class sheet needs, in one round trip.
//
// The sheet and the full page show the same class; the page stays, because a
// link someone was sent has to open something real. This is the same data
// without the chrome, so tapping a row in a list keeps you in the list.

export type ClassDetail = {
  id: string;
  /** The signed-in viewer owns this class and may edit it. */
  mine: boolean;
  handle: string;
  coachName: string;
  coachPhoto: string | null;
  coachColor: string;
  /** Whose page the "Coached by" row taps through to, or null for no row.
   *  Not derived from `handle`, which is the base the *class* lives under: a
   *  gym's class is addressed under the studio while the person on it has a
   *  page of their own. Null is a gym class with nobody we may name on it. */
  coachHandle: string | null;
  name: string;
  classType: string | null;
  description: string | null;
  image: string | null;
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
  /** Calendar doors for the overflow menu, same targets as the class page. */
  googleUrl: string;
  icsHref: string;
  /** The viewer's own handle, so a share can say who's going. */
  myHandle: string | null;
  /** Whether this viewer can add it: signed in, not theirs, and public. */
  canAdd: boolean;
  added: boolean;
  /** Whether that mark is one the viewer's followers can see. Null when
   *  there is no mark to have an opinion about. The moment of adding used to
   *  be the only place this could be set, which meant it could not be changed
   *  afterwards at all; the sheet the class already opens in is where it can
   *  be both seen and changed. */
  addedPublic: boolean | null;
  /** It's been and gone: say so rather than showing a button that fails. */
  past: boolean;
  /** The viewer is the admin: the sheet offers to change the picture. A beta
   *  power for filling in the catalog; it touches the photo and nothing else. */
  adminPhoto: boolean;
  /** The admin may hand this class a booking link, because it has none. */
  adminLink: boolean;
  /** The admin may repair the listing (words, time, length) or take it
   *  down: reported classes need managing, and the report lands on them. */
  adminEdit: boolean;
  /** "HH:MM", for the admin editor's time input; `time` is for the eye. */
  startRaw: string;
  /** Who marked Going on this occurrence. Owner only: they marked it at this
   *  coach, so the coach can see them; nobody else gets the list. */
  roster: { name: string; photo: string | null; color: string; handle: string | null }[] | null;
  /** RSVP, per the Discover brief: a save the organizer can see. The flag
   *  changes the words (the button, the count) and opens the roster to
   *  whoever leads it; the mechanism stays attendances. */
  rsvp: boolean;
  /** How many said yes to this occurrence. Zero draws nothing: never ship
   *  an empty count. */
  rsvpCount: number;
  /** A gym's class, seen by somebody who could be on it. Null on a coach's own
   *  class, and for anyone with no standing at the studio. */
  shift: {
    /** Who is on this date, once any cover is laid over. */
    onName: string;
    /** The viewer is on it and can put it back in the pool. */
    canGiveUp: boolean;
    /** Nobody is on it and the viewer coaches here. */
    canClaim: boolean;
    /** Who this date can be handed straight to: the gym's shift list, minus
     *  the viewer. Only filled when the viewer is the one on it. */
    sendable: Sendable[];
  } | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `key` is a coach's handle, or a studio's slug when the class belongs to a
 * gym. A gym's account has no handle by design (it is not a person and does
 * not live at /{handle}), so its classes are addressed under the studio they
 * run at. Either way the lookup stays scoped: the class has to belong to the
 * thing named in the URL.
 */
export async function classDetail(
  key: string,
  classId: string,
  d?: string,
): Promise<ClassDetail | null> {
  if (!UUID_RE.test(classId)) return null;
  const db = await getDb();
  let [user] = await db.select().from(schema.users).where(eq(schema.users.handle, key));
  let studioScope: string | null = null;
  if (!user) {
    const [studio] = await db.select().from(schema.studios).where(eq(schema.studios.slug, key));
    if (!studio?.accountUserId) return null;
    const [gym] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, studio.accountUserId));
    if (!gym) return null;
    user = gym;
    studioScope = studio.id;
  }
  const [c] = await db
    .select()
    .from(schema.classes)
    .where(and(eq(schema.classes.id, classId), eq(schema.classes.userId, user.id)));
  if (!c) return null;
  // A gym's class has to be at the studio whose page it was opened from.
  if (studioScope && c.studioId !== studioScope) return null;

  const viewerId = await getSessionUserId();
  const isOwner = viewerId === user.id;
  const isAdminViewer = !isOwner && !!(await currentAdmin());
  const adminPhoto = isAdminViewer;
  // The link power is fill-the-blanks only, so the door only exists where
  // the blank does.
  const adminLink = isAdminViewer && c.links.length === 0;
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

  // Already run: there's nothing to RSVP to. A shared link carries its date, so an
  // old one opens on the day it named, and that day can be behind us.
  const past = occurrenceEnded(whenIso, c.startTime, c.durationMin);
  // Teaching it isn't attending it. The class belongs to the gym, so the owner
  // test alone would offer the coach on the rota a button that setGoing then
  // refuses; a button that fails is worse than no button.
  const teaching = !!viewerId && c.coachUserId === viewerId;
  // Saving is the viewer's calendar state. RSVP changes who can see that
  // state, not whether the class can live on the viewer's calendar at all.
  // Keep the control available on an old saved occurrence too: adding is
  // blocked after it starts, but somebody must always be able to remove it.
  const saveEligible =
    !isOwner && !teaching && !!viewerId && c.isPublic && (await fansVisible());
  let added = false;
  let addedPublic: boolean | null = null;
  if (saveEligible) {
    const [row] = await db
      .select({ id: schema.attendances.id, isPublic: schema.attendances.isPublic })
      .from(schema.attendances)
      .where(
        and(
          eq(schema.attendances.userId, viewerId!),
          eq(schema.attendances.classId, c.id),
          eq(schema.attendances.occurrenceDate, whenIso),
        ),
      );
    added = !!row;
    if (row) addedPublic = row.isPublic !== false;
  }
  const canAdd = saveEligible && (!past || added);

  // The coach's roster for this occurrence. These people marked Going at this
  // coach, so showing the coach is what the mark meant; it stops there. A
  // member looking at the same sheet sees the count of nobody: the field is
  // null for everyone but the owner.
  let roster: ClassDetail["roster"] = null;
  let rsvpCount = 0;
  if (c.rsvp) {
    const marks = await db
      .select({ userId: schema.attendances.userId })
      .from(schema.attendances)
      .where(
        and(eq(schema.attendances.classId, c.id), eq(schema.attendances.occurrenceDate, whenIso)),
      );
    rsvpCount = new Set(marks.map((m) => m.userId)).size;
  }
  if (isOwner) {
    const marks = await db
      .select({ userId: schema.attendances.userId })
      .from(schema.attendances)
      .where(
        and(eq(schema.attendances.classId, c.id), eq(schema.attendances.occurrenceDate, whenIso)),
      );
    const ids = [...new Set(marks.map((m) => m.userId))];
    const people = ids.length
      ? await db.select().from(schema.users).where(inArray(schema.users.id, ids))
      : [];
    roster = people
      .map((p) => ({
        name: p.name.trim() || p.email.split("@")[0],
        photo: p.photo,
        color: avatarColor(p),
        handle: p.handle,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // A gym's rota, from the coach's side. Whoever is on this date can hand it
  // back, and whoever teaches here can take it when nobody is. That is the
  // half of the rota the manager shouldn't have to be in the middle of, and
  // it's what the text message they send today is trying to do.
  let shift: ClassDetail["shift"] = null;
  if (user.kind === "gym" && c.studioId && viewerId && !past) {
    const [cover] = await db
      .select()
      .from(schema.shiftCovers)
      .where(
        and(
          eq(schema.shiftCovers.classId, c.id),
          eq(schema.shiftCovers.occurrenceDate, whenIso),
        ),
      );
    const on = cover ? cover.coachUserId : c.coachUserId;
    let onName = "";
    if (on) {
      const [p] = await db.select().from(schema.users).where(eq(schema.users.id, on));
      onName = p ? p.name.trim() || p.email.split("@")[0] : "";
    }
    let teachesHere = false;
    if (!on) {
      const [me] = await db
        .select({ kind: schema.users.kind })
        .from(schema.users)
        .where(eq(schema.users.id, viewerId));
      if (me && me.kind !== "fan" && me.kind !== "gym") {
        const [picked] = await db
          .select({ userId: schema.coachStudios.userId })
          .from(schema.coachStudios)
          .where(
            and(
              eq(schema.coachStudios.studioId, c.studioId),
              eq(schema.coachStudios.userId, viewerId),
            ),
          );
        const [taught] = await db
          .select({ id: schema.classes.id })
          .from(schema.classes)
          .where(
            and(eq(schema.classes.studioId, c.studioId), eq(schema.classes.userId, viewerId)),
          );
        teachesHere = !!picked || !!taught;
      }
    }
    // The gym's shift list, so the coach on this date can hand it straight to
    // somebody rather than only opening it up and hoping. Managers name the
    // list, because anyone may say they coach here and not everyone who does
    // takes these classes.
    // The same list the staff screen's own Transfer sheet offers, from the
    // one loader: two sheets from two doors onto one act.
    const sendable: Sendable[] = on === viewerId ? await sendableAt(c.studioId, viewerId) : [];
    // Only shown to somebody it means something to: the person on it, or a
    // coach here looking at a slot with nobody on. A member sees none of this,
    // and no name: whether a coach is listed is a separate switch.
    if (on === viewerId || (!on && teachesHere))
      shift = { onName, canGiveUp: on === viewerId, canClaim: !on && teachesHere, sendable };
  }

  // The viewer's handle rides the share once they've saved, so the link
  // preview can say who's going.
  let myHandle: string | null = null;
  if (viewerId && !isOwner) {
    const [viewer] = await db
      .select({ handle: schema.users.handle })
      .from(schema.users)
      .where(eq(schema.users.id, viewerId));
    myHandle = viewer?.handle ?? null;
  }

  // "Add to calendar", same as the page: Google gets a prefilled template
  // link, Apple and Outlook get the .ics. Weekly classes carry the rule.
  // A gym's classes live under the studio, a coach's under their handle. The
  // base is what the caller opened the class from, so the share points back at
  // the same door.
  const base = studioScope ? `s/${key}` : key;
  const classUrl = `${siteOrigin()}/${base}/${c.id}`;
  const locationText = studio ? `${studio.name}, ${studio.address}` : c.location ?? "";
  const gcalDetails = c.links.length
    ? c.links.map((l) => `Book via ${l.label}: ${l.url}`).join("\n") + `\n\n${classUrl}`
    : classUrl;
  const gcalParams = new URLSearchParams({
    action: "TEMPLATE",
    text: c.name,
    dates: `${floatingStart(whenIso, c.startTime)}/${floatingEnd(whenIso, c.startTime, c.durationMin)}`,
    details: gcalDetails,
  });
  if (locationText) gcalParams.set("location", locationText);
  if (!c.specificDate) gcalParams.set("recur", weeklyRule(c.dayOfWeek, c.endsOn));

  // Who to put on the row. A gym owns its classes, so the owner is the place;
  // the person is on the rota, and only where they show their shifts. Resolved
  // apart from the `shift` block above, which is the rota's controls and only
  // exists for a signed-in viewer on a future date: who taught a class is not
  // a question that should depend on either.
  const onDuty =
    user.kind === "gym" ? shiftCoach(await shiftNaming([c.id]), c.id, whenIso) : null;
  const who = onDuty ?? user;

  return {
    id: c.id,
    mine: isOwner,
    handle: base,
    coachName: who.name,
    coachPhoto: who.photo,
    coachColor: avatarColor(who),
    coachHandle: who.kind === "gym" ? null : who.handle,
    name: c.name,
    classType: c.classType,
    description: c.description,
    image: c.image,
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
    shareUrl: `${siteOrigin()}/${base}/${c.id}?d=${whenIso}`,
    googleUrl: `https://calendar.google.com/calendar/render?${gcalParams.toString()}`,
    // The per-class .ics route takes the bare key (handle or slug), not the
    // page's /s/ prefix.
    icsHref: `/api/cal/${key}/${c.id}`,
    myHandle,
    canAdd,
    rsvp: c.rsvp,
    rsvpCount,
    added,
    addedPublic,
    past,
    roster,
    adminPhoto,
    adminLink,
    // Never on a gym's class: its rows are rota slots (one row per slot,
    // carrying swaps and marks), and the coach editor's save is a delete
    // and reinsert. The rota is where a gym's week is managed.
    adminEdit: isAdminViewer && user.kind !== "gym",
    startRaw: c.startTime,
    shift,
  };
}
