"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getDb, schema } from "@/db";
import type { BookingLink } from "@/db/schema";
import { getSessionUserId } from "@/lib/session";
import { detectProvider, dowOfDate, todayIso } from "@/lib/format";
import { syncUserToGoogle } from "@/lib/gcal";
import { humanTime, notifyCancelled } from "@/lib/cancel";

// Mirror the schedule to Google after the response is sent, so publishing stays
// snappy. No-ops unless the trainer connected Google.
function syncGoogleAfter(userId: string) {
  after(() => syncUserToGoogle(userId).catch((err) => console.error("gcal sync failed", err)));
}

export type PublishInput = {
  name: string;
  classType?: string | null;
  description?: string | null;
  days: number[]; // 0 = Monday … 6 = Sunday
  // set = a one-off pinned to this ISO date; null/absent = standing weekly on `days`.
  specificDate?: string | null;
  endsOn?: string | null; // weekly only: last date it runs
  startTime: string; // "HH:MM"
  durationMin: number;
  studioId?: string | null; // required for public; optional for private
  location?: string | null; // free-form place for private items with no studio
  isPublic?: boolean; // default true
  links: BookingLink[];
};

// Types come from a controlled dropdown (curated + coach-added), so just trim
// and cap; an empty value clears the type.
function cleanType(t: string | null | undefined): string | null {
  const v = (t ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
  return v || null;
}

// The classes already logged at a studio, by any coach — powers the studio-first
// picker so a coach reuses an existing class (with its type + description).
export async function getStudioCatalog(
  studioId: string,
): Promise<{ name: string; classType: string | null; description: string | null }[]> {
  const userId = await getSessionUserId();
  if (!userId) return [];
  const db = await getDb();
  return db
    .select({
      name: schema.studioClasses.name,
      classType: schema.studioClasses.classType,
      description: schema.studioClasses.description,
    })
    .from(schema.studioClasses)
    .where(eq(schema.studioClasses.studioId, studioId))
    .orderBy(schema.studioClasses.name);
}

// Add a coach-defined class type to the shared list; returns the stored name.
export async function addClassType(
  nameRaw: string,
): Promise<{ ok: boolean; name?: string; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const name = nameRaw.trim().replace(/\s+/g, " ").slice(0, 30);
  if (name.length < 2) return { ok: false, error: "Type a longer name." };
  const db = await getDb();
  await db
    .insert(schema.customClassTypes)
    .values({ name, nameKey: name.toLowerCase(), createdByUserId: userId })
    .onConflictDoNothing({ target: schema.customClassTypes.nameKey });
  return { ok: true, name };
}

function cleanLinks(links: BookingLink[]): BookingLink[] {
  // The label is derived from the URL server-side, so it's always correct
  // regardless of what the client sent.
  return links
    .filter((l) => l.url.trim())
    .map((l) => ({ label: detectProvider(l.url), url: l.url.trim() }));
}

type SaveResult = { ok: boolean; count?: number; error?: string };

// Shared by publish (new rows) and edit (replaceClassId set: the original
// row is swapped for rows on the selected days).
async function save(userId: string, input: PublishInput, replaceClassId?: string): Promise<SaveResult> {
  const name = input.name.trim() || "New class";
  // A one-off is authoritative on its date: the weekday comes from the date,
  // not the day pills. Weekly classes fan out across the selected days.
  const oneOff = input.specificDate?.trim() || null;
  if (oneOff && !/^\d{4}-\d{2}-\d{2}$/.test(oneOff)) return { ok: false, error: "Invalid date." };
  // A one-off is its own date, so an end date only means something weekly.
  const endsOn = oneOff ? null : input.endsOn?.trim() || null;
  if (endsOn && !/^\d{4}-\d{2}-\d{2}$/.test(endsOn))
    return { ok: false, error: "Invalid end date." };
  if (endsOn && endsOn < todayIso())
    return { ok: false, error: "That end date has already passed." };
  const days = oneOff
    ? [dowOfDate(oneOff)]
    : [...new Set(input.days)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (!days.length) return { ok: false, error: oneOff ? "Pick a date." : "Pick at least one day." };
  if (!/^\d{2}:\d{2}$/.test(input.startTime)) return { ok: false, error: "Invalid start time." };
  const durationMin = Math.round(input.durationMin);
  if (!(durationMin > 0 && durationMin <= 24 * 60)) return { ok: false, error: "Invalid length." };

  const db = await getDb();
  const isPublic = input.isPublic !== false; // default public
  // Public inventory is coach-only. There was no gate here, and beta members
  // used the gap the only way they could: recreating their gyms' real classes
  // to get their own week into the app. They get personal entries for that
  // (personal_classes); the directory stays classes taught by whoever posted
  // them. Start coaching is still one tap for anyone who actually coaches.
  if (isPublic) {
    const [me] = await db
      .select({ kind: schema.users.kind })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    if (me?.kind === "fan") {
      return {
        ok: false,
        error:
          "Publishing classes is for coaches. Add classes you attend to Your week, or ask to become one in settings.",
      };
    }
  }
  let studio: typeof schema.studios.$inferSelect | undefined;
  if (input.studioId) {
    [studio] = await db.select().from(schema.studios).where(eq(schema.studios.id, input.studioId));
    if (!studio) return { ok: false, error: "Pick a studio." };
  }
  // Public classes must have a studio; private ones can skip it and use a
  // free-form location instead.
  if (isPublic && !studio) return { ok: false, error: "Pick a studio." };
  const studioId = studio?.id ?? null;
  const location = studioId ? null : input.location?.trim().slice(0, 120) || null;
  const links = cleanLinks(input.links ?? []);
  const classType = cleanType(input.classType);
  const description = input.description?.trim().slice(0, 500) || null;

  // Cancelled single dates survive an edit: moving a class to 7:15 shouldn't
  // quietly put you back on the Friday you already said you were off.
  const keptSkips = new Map<number, string[]>();
  // Who was coming, by weekday, so the rewrite below can put them back. -1 is
  // the one-off / single-day case, which has no weekday to key on.
  const keptGoing = new Map<number, { userId: string; occurrenceDate: string }[]>();
  // The set this save belongs to.
  //
  // A new weekly class joins an existing one when it is the same class in the
  // coach's terms: same name, same time, same place, same visibility. Adding
  // Friday to a class you already teach Monday and Wednesday should give you
  // one class that runs three days, not two entries with the same name.
  //
  // Anything that differs starts its own set. That distinction is the whole
  // fix: Stretch+ at 6am in Verona and Stretch+ at 6:30pm in Montclair are two
  // classes, and treating them as one is what let an edit to either wipe the
  // other.
  let seriesId: string = randomUUID();
  if (!replaceClassId && !oneOff) {
    const [sibling] = await db
      .select({ seriesId: schema.classes.seriesId })
      .from(schema.classes)
      .where(
        and(
          eq(schema.classes.userId, userId),
          eq(schema.classes.name, name),
          eq(schema.classes.startTime, input.startTime),
          studioId ? eq(schema.classes.studioId, studioId) : isNull(schema.classes.studioId),
          location ? eq(schema.classes.location, location) : isNull(schema.classes.location),
          eq(schema.classes.isPublic, isPublic),
          isNull(schema.classes.specificDate),
        ),
      )
      .limit(1);
    if (sibling) seriesId = sibling.seriesId;
  }
  if (replaceClassId) {
    const [existing] = await db
      .select({
        id: schema.classes.id,
        seriesId: schema.classes.seriesId,
        specificDate: schema.classes.specificDate,
      })
      .from(schema.classes)
      .where(and(eq(schema.classes.id, replaceClassId), eq(schema.classes.userId, userId)));
    if (!existing) return { ok: false, error: "Class not found." };
    seriesId = existing.seriesId;
    if (!existing.specificDate) {
      // Editing a weekly class replaces its whole recurring set (all its
      // weekly rows), so the selected days become the new set - one-off dated
      // instances of the same class are left untouched.
      //
      // Scoped to the series, not the template: the template is keyed on the
      // class NAME, so a coach teaching the same class at two studios shares
      // one template across both. Deleting by template took the other studio's
      // class with it and rewrote it as this one.
      // Editing replaces the rows, so anything pointing at them has to be
      // carried over first. Going marks are the reason: they reference the row
      // by id, so the delete below would fail on the foreign key, and a coach
      // changing a description could not save at all once anyone was coming.
      const old = await db
        .select({ id: schema.classes.id, dayOfWeek: schema.classes.dayOfWeek })
        .from(schema.classes)
        .where(
          and(
            eq(schema.classes.userId, userId),
            eq(schema.classes.seriesId, existing.seriesId),
            isNull(schema.classes.specificDate),
          ),
        );
      const oldIds = old.map((o) => o.id);
      const dayOfOldId = new Map(old.map((o) => [o.id, o.dayOfWeek]));
      if (oldIds.length) {
        const marks = await db
          .select()
          .from(schema.attendances)
          .where(inArray(schema.attendances.classId, oldIds));
        for (const m of marks) {
          const dow = dayOfOldId.get(m.classId);
          if (dow === undefined) continue;
          const list = keptGoing.get(dow) ?? [];
          list.push({ userId: m.userId, occurrenceDate: m.occurrenceDate });
          keptGoing.set(dow, list);
        }
        await db.delete(schema.attendances).where(inArray(schema.attendances.classId, oldIds));
      }
      const gone = await db
        .delete(schema.classes)
        .where(
          and(
            eq(schema.classes.userId, userId),
            eq(schema.classes.seriesId, existing.seriesId),
            isNull(schema.classes.specificDate),
          ),
        )
        .returning({ dayOfWeek: schema.classes.dayOfWeek, skipDates: schema.classes.skipDates });
      for (const g of gone) if (g.skipDates.length) keptSkips.set(g.dayOfWeek, g.skipDates);
    } else {
      const marks = await db
        .select()
        .from(schema.attendances)
        .where(eq(schema.attendances.classId, existing.id));
      for (const m of marks) {
        const list = keptGoing.get(-1) ?? [];
        list.push({ userId: m.userId, occurrenceDate: m.occurrenceDate });
        keptGoing.set(-1, list);
      }
      await db.delete(schema.attendances).where(eq(schema.attendances.classId, existing.id));
      await db.delete(schema.classes).where(eq(schema.classes.id, existing.id));
    }
  }

  // Templates track latest: publishing upserts the saved class with the
  // values used, so autofill always reflects the most recent version.
  const [template] = await db
    .insert(schema.classTemplates)
    .values({ userId, name, classType, description, startTime: input.startTime, durationMin, studioId, location, isPublic, links })
    .onConflictDoUpdate({
      target: [schema.classTemplates.userId, schema.classTemplates.name],
      set: { classType, description, startTime: input.startTime, durationMin, studioId, location, isPublic, links, updatedAt: new Date() },
    })
    .returning();

  const inserted = await db.insert(schema.classes).values(
    days.map((dayOfWeek) => ({
      userId,
      templateId: template.id,
      seriesId,
      dayOfWeek,
      specificDate: oneOff,
      endsOn,
      skipDates: oneOff ? [] : (keptSkips.get(dayOfWeek) ?? []),
      startTime: input.startTime,
      durationMin,
      name,
      classType,
      description,
      studioId,
      location,
      isPublic,
      links,
    })),
  ).returning({ id: schema.classes.id, dayOfWeek: schema.classes.dayOfWeek });

  // Put the Going marks back on the rows that replaced the ones they were on.
  // A day that no longer runs has nowhere to put them, and those people are
  // told about it by the caller.
  if (keptGoing.size) {
    const idForDay = new Map(inserted.map((r) => [r.dayOfWeek, r.id]));
    const rows: { userId: string; classId: string; occurrenceDate: string }[] = [];
    for (const [dow, marks] of keptGoing) {
      const classId = dow === -1 ? inserted[0]?.id : idForDay.get(dow);
      if (!classId) continue;
      for (const m of marks) {
        rows.push({ userId: m.userId, classId, occurrenceDate: m.occurrenceDate });
      }
    }
    if (rows.length) await db.insert(schema.attendances).values(rows).onConflictDoNothing();
  }

  // Log this class into the shared per-studio catalog (deduped by studio +
  // normalized name). Public + studio only: private sessions must never leak
  // into the cross-coach catalog.
  if (isPublic && studio) {
    try {
      await db
        .insert(schema.studioClasses)
        .values({
          studioId: studio.id,
          name,
          nameKey: name.toLowerCase(),
          classType,
          description,
          createdByUserId: userId,
        })
        .onConflictDoUpdate({
          target: [schema.studioClasses.studioId, schema.studioClasses.nameKey],
          set: {
            name,
            ...(classType ? { classType } : {}),
            ...(description ? { description } : {}),
            updatedAt: new Date(),
          },
        });
    } catch (err) {
      console.error("studio catalog upsert failed", err);
    }
  }

  // Subscribers get the schedule as one weekly digest (see sendWeeklyDigests),
  // not a per-change email, so publishing just updates the page + Google sync.
  syncGoogleAfter(userId);
  revalidatePath("/app");
  return { ok: true, count: days.length };
}

export async function publishClasses(input: PublishInput): Promise<SaveResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  return save(userId, input);
}

export async function updateClass(classId: string, input: PublishInput): Promise<SaveResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  return save(userId, input, classId);
}

// A repeating class is one row per weekday sharing a template, so deleting is
// two different intentions: drop the day you opened, or drop the whole set.
// "all" mirrors what editing already does — the recurring rows go, one-off
// dated instances of the same class stay.
export async function deleteClass(
  classId: string,
  scope: "occurrence" | "one" | "all" = "one",
  /** Required for "occurrence": the single ISO date being cancelled. */
  occurrenceDate?: string | null,
): Promise<{ ok: boolean; error?: string; count?: number }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.classes)
    .where(and(eq(schema.classes.id, classId), eq(schema.classes.userId, userId)));
  if (!row) return { ok: true, count: 0 };

  const [coach] = await db
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  let where = row.location;
  if (row.studioId) {
    const [st] = await db
      .select({ name: schema.studios.name })
      .from(schema.studios)
      .where(eq(schema.studios.id, row.studioId));
    where = st?.name ?? null;
  }
  const about = {
    coachName: coach?.name ?? "",
    className: row.name,
    time: humanTime(row.startTime),
    where,
  };
  const today = todayIso();

  // Everyone who said they were coming to these classes, and their email.
  // They have to go regardless: a Going mark points at the class row, so the
  // delete below fails on the foreign key while any survive. Until this, a
  // coach simply could not delete a class once anyone had marked it.
  const clearGoing = async (classIds: string[]) => {
    if (!classIds.length) return [] as { userId: string; email: string; date: string }[];
    const marks = await db
      .select({
        userId: schema.attendances.userId,
        date: schema.attendances.occurrenceDate,
        email: schema.users.email,
      })
      .from(schema.attendances)
      .innerJoin(schema.users, eq(schema.users.id, schema.attendances.userId))
      .where(inArray(schema.attendances.classId, classIds));
    await db.delete(schema.attendances).where(inArray(schema.attendances.classId, classIds));
    // Only the ones still to come. Nobody needs telling that last Tuesday is off.
    return marks.filter((m) => m.date >= today);
  };

  // Cancelling a single date doesn't delete anything — the standing class keeps
  // running, this one day is stamped out of it. A one-off has only the one
  // occurrence, so cancelling it is just deleting it.
  if (scope === "occurrence" && !row.specificDate) {
    const iso = occurrenceDate?.trim() ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { ok: false, error: "Which date?" };
    if (!row.skipDates.includes(iso)) {
      await db
        .update(schema.classes)
        .set({ skipDates: [...row.skipDates, iso].sort() })
        .where(eq(schema.classes.id, row.id));
      // Nobody is going to a class that isn't on. Clearing the marks keeps the
      // members' weeks and share images honest — they read attendances
      // directly rather than through runsOn. And whoever was coming gets told,
      // which is the whole point of having let them mark it.
      const told = await db
        .select({
          userId: schema.attendances.userId,
          date: schema.attendances.occurrenceDate,
          email: schema.users.email,
        })
        .from(schema.attendances)
        .innerJoin(schema.users, eq(schema.users.id, schema.attendances.userId))
        .where(
          and(
            eq(schema.attendances.classId, row.id),
            eq(schema.attendances.occurrenceDate, iso),
          ),
        );
      await db
        .delete(schema.attendances)
        .where(
          and(
            eq(schema.attendances.classId, row.id),
            eq(schema.attendances.occurrenceDate, iso),
          ),
        );
      if (told.length && iso >= today) {
        after(() => notifyCancelled(about, told));
      }
    }
    syncGoogleAfter(userId);
    revalidatePath("/app");
    return { ok: true, count: 1 };
  }

  let count = 1;
  if (scope === "all" && !row.specificDate) {
    const doomed = await db
      .select({ id: schema.classes.id })
      .from(schema.classes)
      .where(
        and(
          eq(schema.classes.userId, userId),
          eq(schema.classes.seriesId, row.seriesId),
          isNull(schema.classes.specificDate),
        ),
      );
    const told = await clearGoing(doomed.map((d) => d.id));
    const gone = await db
      .delete(schema.classes)
      .where(
        and(
          eq(schema.classes.userId, userId),
          eq(schema.classes.seriesId, row.seriesId),
          isNull(schema.classes.specificDate),
        ),
      )
      .returning({ id: schema.classes.id });
    count = gone.length;
    if (told.length) after(() => notifyCancelled(about, told));
  } else {
    const told = await clearGoing([row.id]);
    await db.delete(schema.classes).where(eq(schema.classes.id, row.id));
    if (told.length) after(() => notifyCancelled(about, told));
  }

  syncGoogleAfter(userId);
  revalidatePath("/app");
  return { ok: true, count };
}
