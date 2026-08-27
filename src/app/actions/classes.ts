"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getDb, schema } from "@/db";
import { storeImage } from "@/lib/storage";
import type { BookingLink } from "@/db/schema";
import { currentAdmin } from "@/lib/admin";
import { getSessionUserId } from "@/lib/session";
import { detectProvider, dowOfDate, occurrenceEnded, todayIso } from "@/lib/format";
import { syncUserToGoogle } from "@/lib/gcal";
import { humanTime, notifyCancelled } from "@/lib/cancel";
import { objectionableContentError } from "@/lib/content-safety";

// Mirror the schedule to Google after the response is sent, so publishing stays
// snappy. No-ops unless the trainer connected Google.
function syncGoogleAfter(userId: string) {
  after(() => syncUserToGoogle(userId).catch((err) => console.error("gcal sync failed", err)));
}

export type PublishInput = {
  name: string;
  classType?: string | null;
  description?: string | null;
  image?: string | null;
  days: number[]; // 0 = Monday … 6 = Sunday
  // set = a one-off pinned to this ISO date; null/absent = standing weekly on `days`.
  specificDate?: string | null;
  endsOn?: string | null; // weekly only: last date it runs
  startTime: string; // "HH:MM"
  durationMin: number;
  studioId?: string | null; // required for public; optional for private
  location?: string | null; // free-form place for private items with no studio
  isPublic?: boolean; // default true
  /** Ask people to RSVP: a save the organizer can see. Coaching only. */
  rsvp?: boolean;
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
): Promise<{ name: string; classType: string | null; description: string | null; image: string | null }[]> {
  const userId = await getSessionUserId();
  if (!userId) return [];
  const db = await getDb();
  return db
    .select({
      name: schema.studioClasses.name,
      classType: schema.studioClasses.classType,
      description: schema.studioClasses.description,
      image: schema.studioClasses.image,
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
  const safetyError = objectionableContentError(name);
  if (safetyError) return { ok: false, error: safetyError };
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
  return links.flatMap((link) => {
    const raw = link.url.trim();
    if (!raw || raw.length > 2_048 || /[\r\n]/.test(raw)) return [];
    try {
      const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      const url = new URL(candidate);
      if (url.protocol !== "https:" && url.protocol !== "http:") return [];
      return [{ label: detectProvider(url.href), url: url.href }];
    } catch {
      return [];
    }
  });
}

// `id` is the first inserted row, so the moment after publishing can offer
// the class itself (its link, its card) without a second lookup.
type SaveResult = {
  ok: boolean;
  count?: number;
  id?: string;
  /** The first upcoming occurrence created by this save. Calendar uses it to
   *  show somebody exactly where their new class landed. */
  focus?: { id: string; iso: string };
  error?: string;
};

type Db = Awaited<ReturnType<typeof getDb>>;
type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

class ScheduleConflictError extends Error {}

function postgresErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

/**
 * A class edit is a small schedule rewrite, not a collection of independent
 * deletes and inserts. Serializable isolation makes the row(s) the editor
 * read into a precondition: if another request changes the same schedule, one
 * transaction is retried against the committed state instead of interleaving
 * the two rewrites. PostgreSQL reports both serialization failures and
 * deadlocks as safe-to-retry transaction failures.
 */
async function scheduleTransaction<T>(db: Db, work: (tx: Transaction) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(work, { isolationLevel: "serializable" });
    } catch (error) {
      const retryable = ["40001", "40P01"].includes(postgresErrorCode(error) ?? "");
      if (!retryable) throw error;
      if (attempt >= 2)
        throw new ScheduleConflictError("Schedule kept changing while the transaction retried");
      // Give the winning transaction a moment to commit before reading the
      // schedule again. The longest wait is 30ms and happens only on conflict.
      await new Promise((resolve) => setTimeout(resolve, 15 * (attempt + 1)));
    }
  }
}

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

  const isPublic = input.isPublic !== false; // default public
  // RSVP is a public-class idea: a private session has nobody to count.
  const rsvp = isPublic && input.rsvp === true;
  const links = cleanLinks(input.links ?? []);
  const classType = cleanType(input.classType);
  const description = input.description?.trim().slice(0, 500) || null;
  const safetyError = objectionableContentError(name, classType, description, input.location);
  if (safetyError) return { ok: false, error: safetyError };
  // Blob storage is external to PostgreSQL and cannot participate in its
  // transaction. Resolve the final URL before opening a transaction so a
  // slow upload never holds schedule locks. A failed upload stops the save.
  const image = await storeImage(input.image?.trim() || null, "class");
  const db = await getDb();

  const committed = await scheduleTransaction(db, async (tx) => {
    // Public inventory is coach-only. Every class also resolves its wall-clock
    // zone from the selected studio, or from its owner when no studio applies.
    const [owner] = await tx
      .select({ kind: schema.users.kind, timeZone: schema.users.timeZone })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    if (!owner) return { ok: false as const, error: "Session expired." };
    if (isPublic && owner.kind === "fan") {
      return {
        ok: false as const,
        error:
          "Publishing classes is for coaches. Add classes you attend to Your week, or ask to become one in settings.",
      };
    }
    let studio: typeof schema.studios.$inferSelect | undefined;
    if (input.studioId) {
      [studio] = await tx.select().from(schema.studios).where(eq(schema.studios.id, input.studioId));
      if (!studio) return { ok: false as const, error: "Pick a studio." };
    }
    // Public classes must have a studio; private ones can skip it and use a
    // free-form location instead.
    if (isPublic && !studio) return { ok: false as const, error: "Pick a studio." };
    const studioId = studio?.id ?? null;
    const location = studioId ? null : input.location?.trim().slice(0, 120) || null;
    const timeZone = studio?.timeZone ?? owner.timeZone;

  // Cancelled single dates survive an edit: moving a class to 7:15 shouldn't
  // quietly put you back on the Friday you already said you were off.
  const keptSkips = new Map<number, string[]>();
  // Who was coming, by weekday, so the rewrite below can put them back. -1 is
  // the one-off / single-day case, which has no weekday to key on.
  const keptGoing = new Map<
    number,
    {
      userId: string;
      occurrenceDate: string;
      companions: string[];
      isPublic: boolean;
      createdAt: Date;
    }[]
  >();
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
  let existingSeriesRows: { id: string; dayOfWeek: number }[] = [];
  if (!replaceClassId && !oneOff) {
    const [sibling] = await tx
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
    if (sibling) {
      seriesId = sibling.seriesId;
      existingSeriesRows = await tx
        .select({ id: schema.classes.id, dayOfWeek: schema.classes.dayOfWeek })
        .from(schema.classes)
        .where(
          and(
            eq(schema.classes.userId, userId),
            eq(schema.classes.seriesId, sibling.seriesId),
            isNull(schema.classes.specificDate),
          ),
        );
    }
  }
  if (!replaceClassId && oneOff) {
    const [duplicate] = await tx
      .select({
        id: schema.classes.id,
        seriesId: schema.classes.seriesId,
        dayOfWeek: schema.classes.dayOfWeek,
      })
      .from(schema.classes)
      .where(
        and(
          eq(schema.classes.userId, userId),
          eq(schema.classes.name, name),
          eq(schema.classes.startTime, input.startTime),
          eq(schema.classes.durationMin, durationMin),
          studioId ? eq(schema.classes.studioId, studioId) : isNull(schema.classes.studioId),
          location ? eq(schema.classes.location, location) : isNull(schema.classes.location),
          classType ? eq(schema.classes.classType, classType) : isNull(schema.classes.classType),
          description ? eq(schema.classes.description, description) : isNull(schema.classes.description),
          eq(schema.classes.isPublic, isPublic),
          eq(schema.classes.rsvp, rsvp),
          eq(schema.classes.links, links),
          eq(schema.classes.specificDate, oneOff),
        ),
      )
      .limit(1);
    if (duplicate) {
      seriesId = duplicate.seriesId;
      existingSeriesRows = [{ id: duplicate.id, dayOfWeek: duplicate.dayOfWeek }];
    }
  }
  if (replaceClassId) {
    const [existing] = await tx
      .select({
        id: schema.classes.id,
        seriesId: schema.classes.seriesId,
        specificDate: schema.classes.specificDate,
      })
      .from(schema.classes)
      .where(and(eq(schema.classes.id, replaceClassId), eq(schema.classes.userId, userId)));
    if (!existing)
      return {
        ok: false as const,
        error: "This class changed or was deleted. Close it and reopen the latest schedule before saving.",
      };
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
      const old = await tx
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
        const marks = await tx
          .select()
          .from(schema.attendances)
          .where(inArray(schema.attendances.classId, oldIds));
        for (const m of marks) {
          const dow = dayOfOldId.get(m.classId);
          if (dow === undefined) continue;
          const list = keptGoing.get(dow) ?? [];
          list.push({
            userId: m.userId,
            occurrenceDate: m.occurrenceDate,
            companions: m.companions,
            isPublic: m.isPublic,
            createdAt: m.createdAt,
          });
          keptGoing.set(dow, list);
        }
        await tx.delete(schema.attendances).where(inArray(schema.attendances.classId, oldIds));
      }
      const gone = await tx
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
      const marks = await tx
        .select()
        .from(schema.attendances)
        .where(eq(schema.attendances.classId, existing.id));
      for (const m of marks) {
        const list = keptGoing.get(-1) ?? [];
        list.push({
          userId: m.userId,
          occurrenceDate: m.occurrenceDate,
          companions: m.companions,
          isPublic: m.isPublic,
          createdAt: m.createdAt,
        });
        keptGoing.set(-1, list);
      }
      await tx.delete(schema.attendances).where(eq(schema.attendances.classId, existing.id));
      await tx.delete(schema.classes).where(eq(schema.classes.id, existing.id));
    }
  }

  // Templates track latest: publishing upserts the saved class with the
  // values used, so autofill always reflects the most recent version.
  const [template] = await tx
    .insert(schema.classTemplates)
    .values({ userId, name, classType, description, image, startTime: input.startTime, timeZone, durationMin, studioId, location, isPublic, links })
    .onConflictDoUpdate({
      target: [schema.classTemplates.userId, schema.classTemplates.name],
      set: { classType, description, image, startTime: input.startTime, timeZone, durationMin, studioId, location, isPublic, links, updatedAt: new Date() },
    })
    .returning();

  // Re-submitting an identical publish (double tap, network retry) is
  // naturally idempotent. The signature above selects the existing series;
  // only occurrences that are not already part of it are inserted.
  const existingDays = new Set(existingSeriesRows.map((row) => row.dayOfWeek));
  const daysToInsert = replaceClassId ? days : days.filter((day) => !existingDays.has(day));
  const inserted = daysToInsert.length
    ? await tx.insert(schema.classes).values(
      daysToInsert.map((dayOfWeek) => ({
      userId,
      templateId: template.id,
      seriesId,
      dayOfWeek,
      specificDate: oneOff,
      endsOn,
      skipDates: oneOff ? [] : (keptSkips.get(dayOfWeek) ?? []),
      startTime: input.startTime,
      timeZone,
      durationMin,
      name,
      classType,
      description,
      image,
      studioId,
      location,
      isPublic,
      rsvp,
      links,
      })),
    ).returning({ id: schema.classes.id, dayOfWeek: schema.classes.dayOfWeek })
    : [];

  // Put the Going marks back on the rows that replaced the ones they were on.
  // A day that no longer runs has nowhere to put them, and those people are
  // told about it by the caller.
  if (keptGoing.size) {
    const idForDay = new Map(inserted.map((r) => [r.dayOfWeek, r.id]));
    const rows: {
      userId: string;
      classId: string;
      occurrenceDate: string;
      companions: string[];
      isPublic: boolean;
      createdAt: Date;
    }[] = [];
    for (const [dow, marks] of keptGoing) {
      const classId = dow === -1 ? inserted[0]?.id : idForDay.get(dow);
      if (!classId) continue;
      for (const m of marks) {
        rows.push({
          userId: m.userId,
          classId,
          occurrenceDate: m.occurrenceDate,
          companions: m.companions,
          isPublic: m.isPublic,
          createdAt: m.createdAt,
        });
      }
    }
    if (rows.length) await tx.insert(schema.attendances).values(rows).onConflictDoNothing();
  }

  // Log this class into the shared per-studio catalog (deduped by studio +
  // normalized name). Public + studio only: private sessions must never leak
  // into the cross-coach catalog.
  if (isPublic && studio) {
    await tx
      .insert(schema.studioClasses)
      .values({
        studioId: studio.id,
        name,
        nameKey: name.toLowerCase(),
        classType,
        description,
        image,
        createdByUserId: userId,
      })
      .onConflictDoUpdate({
        target: [schema.studioClasses.studioId, schema.studioClasses.nameKey],
        set: {
          name,
          ...(classType ? { classType } : {}),
          ...(description ? { description } : {}),
          ...(image ? { image } : {}),
          updatedAt: new Date(),
        },
      });
  }

  const first = inserted[0] ?? existingSeriesRows.find((row) => days.includes(row.dayOfWeek));
  return { ok: true as const, studio, inserted, first, timeZone };
  }).catch((error) => {
    if (error instanceof ScheduleConflictError)
      return {
        ok: false as const,
        error: "Your schedule changed in another window. Reopen it and try again.",
      };
    throw error;
  });

  if (!committed.ok) return committed;
  const { studio, inserted, first, timeZone } = committed;

  // Two coaches listing the same slot at the same studio is usually one class
  // twice: a sub, a handoff, a re-listing. Tell both, quietly, and point each
  // at the other so they can sort it out between themselves. The admin
  // Reports tab keeps the bird's-eye view; this is the ground-level nudge.
  if (isPublic && studio) {
    try {
      const clashes = (
        await db
          .select()
          .from(schema.classes)
          .where(
            and(
              eq(schema.classes.studioId, studio.id),
              eq(schema.classes.startTime, input.startTime),
              inArray(schema.classes.dayOfWeek, days),
            ),
          )
      ).filter((c) => c.userId !== userId && c.isPublic);
      if (clashes.length) {
        const { addNotification } = await import("@/lib/notify");
        const { DAYS, fmtTime } = await import("@/lib/format");
        const [me] = await db
          .select({ name: schema.users.name, handle: schema.users.handle })
          .from(schema.users)
          .where(eq(schema.users.id, userId));
        const otherIds = [...new Set(clashes.map((c) => c.userId))];
        const people = await db
          .select({ id: schema.users.id, name: schema.users.name, handle: schema.users.handle })
          .from(schema.users)
          .where(inArray(schema.users.id, otherIds));
        for (const p of people) {
          const clash = clashes.find((c) => c.userId === p.id)!;
          const slot = `${DAYS[clash.dayOfWeek]} ${fmtTime(input.startTime)} at ${studio.name}`;
          const myName = me?.name?.trim() || "Another coach";
          const theirName = p.name.trim() || "another coach";
          const bodyTheirs = `Their ${name} and your ${clash.name} share ${slot}. If it's one class, message each other and keep one listing.`;
          const bodyMine = `Your ${name} and their ${clash.name} share ${slot}. If it's one class, message each other and keep one listing.`;
          // Once per pair and slot: the body is the dedupe key, so re-saving
          // a class that keeps its time doesn't nag anyone again.
          const [already] = await db
            .select({ id: schema.notifications.id })
            .from(schema.notifications)
            .where(
              and(
                eq(schema.notifications.userId, p.id),
                eq(schema.notifications.type, "class_overlap"),
                eq(schema.notifications.body, bodyTheirs),
              ),
            );
          if (already) continue;
          await addNotification(p.id, {
            type: "class_overlap",
            title: `You and ${myName} both list ${slot}`,
            body: bodyTheirs,
            href: me?.handle ? `/${me.handle}` : null,
            actorUserId: userId,
          });
          await addNotification(userId, {
            type: "class_overlap",
            title: `You and ${theirName} both list ${slot}`,
            body: bodyMine,
            href: p.handle ? `/${p.handle}` : null,
            actorUserId: p.id,
          });
        }
      }
    } catch (err) {
      console.error("overlap notice failed", err);
    }
  }

  // Subscribers get the schedule as one weekly digest (see sendWeeklyDigests),
  // not a per-change email, so publishing just updates the page + Google sync.
  syncGoogleAfter(userId);
  revalidatePath("/calendar");

  let focusIso: string | null = oneOff;
  if (first && !focusIso) {
    const cursor = new Date(`${todayIso()}T00:00:00Z`);
    for (let offset = 0; offset < 14; offset++) {
      const iso = cursor.toISOString().slice(0, 10);
      if (
        dowOfDate(iso) === first.dayOfWeek &&
        !occurrenceEnded(iso, input.startTime, durationMin, timeZone) &&
        (!endsOn || iso <= endsOn)
      ) {
        focusIso = iso;
        break;
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return {
    ok: true,
    count: inserted.length,
    id: first?.id,
    focus: first && focusIso ? { id: first.id, iso: focusIso } : undefined,
  };
}

export async function publishClasses(input: PublishInput): Promise<SaveResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  return save(userId, input);
}

export async function updateClass(classId: string, input: PublishInput): Promise<SaveResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };
  const db = await getDb();
  const [row] = await db
    .select({ userId: schema.classes.userId })
    .from(schema.classes)
    .where(eq(schema.classes.id, classId));
  if (!row)
    return {
      ok: false,
      error: "This class changed or was deleted. Close it and reopen the latest schedule before saving.",
    };
  if (row.userId !== userId) {
    // The admin can edit any coach's class with the coach's own editor, the
    // same acting-as-owner bypass deleteClass carries: everything in save()
    // keys on the owner, so the template, the catalog write and the Google
    // sync all land on whose class it is. A gym's is the one refusal: its
    // rows are one slot each, carrying swaps and marks, and save()'s
    // delete-and-reinsert is exactly what the rota exists to avoid.
    if (!(await currentAdmin())) return { ok: false, error: "Class not found." };
    const [owner] = await db
      .select({ kind: schema.users.kind })
      .from(schema.users)
      .where(eq(schema.users.id, row.userId));
    if (owner?.kind === "gym")
      return { ok: false, error: "A gym's class is managed on its rota." };
  }
  return save(row.userId, input, classId);
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
  const [candidate] = await db
    .select({ id: schema.classes.id, userId: schema.classes.userId })
    .from(schema.classes)
    .where(eq(schema.classes.id, classId));
  if (!candidate) return { ok: true, count: 0 };
  // The admin can act on a reported class; everyone else only on their own.
  // The actual mutation rechecks the row inside its transaction. Everything
  // below acts as the owner, so the cancellation notice still
  // goes out under the coach's name, which is whose class it is.
  if (candidate.userId !== userId && !(await currentAdmin())) return { ok: true, count: 0 };
  const today = todayIso();

  const outcome = await scheduleTransaction(db, async (tx) => {
    const [row] = await tx.select().from(schema.classes).where(eq(schema.classes.id, classId));
    // The class id is the delete precondition. A concurrent edit replaces it;
    // a concurrent delete removes it. Either way, retrying becomes a no-op.
    if (!row || row.userId !== candidate.userId) {
      return { ok: true as const, count: 0, changed: false as const, ownerId: candidate.userId, told: [] };
    }
    const ownerId = row.userId;
    const [coach] = await tx
      .select({ name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, ownerId));
    let where = row.location;
    if (row.studioId) {
      const [studio] = await tx
        .select({ name: schema.studios.name })
        .from(schema.studios)
        .where(eq(schema.studios.id, row.studioId));
      where = studio?.name ?? null;
    }
    const about = {
      coachName: coach?.name ?? "",
      className: row.name,
      time: humanTime(row.startTime),
      where,
    };

    // A Going mark references the class row, so attendance removal and class
    // removal must commit or roll back together. Return future attendees to
    // the caller; email is deliberately scheduled only after commit.
    const clearGoing = async (classIds: string[]) => {
      if (!classIds.length) return [] as { userId: string; email: string; date: string }[];
      const marks = await tx
        .select({
          userId: schema.attendances.userId,
          date: schema.attendances.occurrenceDate,
          email: schema.users.email,
        })
        .from(schema.attendances)
        .innerJoin(schema.users, eq(schema.users.id, schema.attendances.userId))
        .where(inArray(schema.attendances.classId, classIds));
      await tx.delete(schema.attendances).where(inArray(schema.attendances.classId, classIds));
      return marks.filter((mark) => mark.date >= today);
    };

    // Cancelling a single date stamps it out of a standing class. A one-off
    // falls through to the ordinary row deletion below.
    if (scope === "occurrence" && !row.specificDate) {
      const iso = occurrenceDate?.trim() ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso))
        return { ok: false as const, error: "Which date?" };
      if (row.skipDates.includes(iso)) {
        return { ok: true as const, count: 1, changed: false as const, ownerId, told: [], about };
      }
      await tx
        .update(schema.classes)
        .set({ skipDates: [...row.skipDates, iso].sort() })
        .where(eq(schema.classes.id, row.id));
      const told = await tx
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
      await tx
        .delete(schema.attendances)
        .where(
          and(
            eq(schema.attendances.classId, row.id),
            eq(schema.attendances.occurrenceDate, iso),
          ),
        );
      return {
        ok: true as const,
        count: 1,
        changed: true as const,
        ownerId,
        told: iso >= today ? told : [],
        about,
      };
    }

    if (scope === "all" && !row.specificDate) {
      const doomed = await tx
        .select({ id: schema.classes.id })
        .from(schema.classes)
        .where(
          and(
            eq(schema.classes.userId, ownerId),
            eq(schema.classes.seriesId, row.seriesId),
            isNull(schema.classes.specificDate),
          ),
        );
      const told = await clearGoing(doomed.map((item) => item.id));
      const gone = await tx
        .delete(schema.classes)
        .where(
          and(
            eq(schema.classes.userId, ownerId),
            eq(schema.classes.seriesId, row.seriesId),
            isNull(schema.classes.specificDate),
          ),
        )
        .returning({ id: schema.classes.id });
      return { ok: true as const, count: gone.length, changed: gone.length > 0, ownerId, told, about };
    }

    const told = await clearGoing([row.id]);
    const gone = await tx
      .delete(schema.classes)
      .where(eq(schema.classes.id, row.id))
      .returning({ id: schema.classes.id });
    return { ok: true as const, count: gone.length, changed: gone.length > 0, ownerId, told, about };
  }).catch((error) => {
    if (error instanceof ScheduleConflictError)
      return {
        ok: false as const,
        error: "Your schedule changed in another window. Reopen it and try again.",
      };
    throw error;
  });

  if (!outcome.ok) return outcome;
  if (outcome.changed) {
    if (outcome.told.length && "about" in outcome && outcome.about)
      after(() => notifyCancelled(outcome.about, outcome.told));
    syncGoogleAfter(outcome.ownerId);
    revalidatePath("/calendar");
  }
  return { ok: true, count: outcome.count };
}
