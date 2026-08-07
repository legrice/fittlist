"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { storeImage } from "@/lib/storage";
import { hiddenFrom } from "@/lib/blocks";
import { clockParts, runsOn, todayIso } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { personalNext } from "@/lib/week";
import type { BookingLink } from "@/db/schema";

// A class you go to, kept by you.
//
// Private by construction: nothing here can make one public, and there is no
// column that could. What it does now carry is everything the coach's form
// asks for, because it is the coach's form: a studio, a type, a description, a
// picture, booking links, a one-off date or a weekly slot with an end.
//
// The one thing that leaves this table is the studio catalog write, and only
// when a studio was picked. "Powerflow Yoga has a Vinyasa at six" is a fact
// about the studio, not about who goes to it, and nothing rendered anywhere
// says who wrote it down. A 1:1 in somebody's garage has no studio, so it
// never travels; that is the same protection the coach path keeps by refusing
// to log a private session.

const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const MAX_ENTRIES = 30; // a week has room for a lot of training, not for a spreadsheet

export type PersonalMatch = {
  classId: string;
  name: string;
  coachName: string;
  handle: string;
  iso: string;
};

export async function addPersonalClass(input: {
  name: string;
  /** One row per day, same as the coach's form. A one-off passes the single
   *  weekday its date falls on. */
  days?: number[];
  dayOfWeek?: number;
  startTime: string;
  durationMin: number;
  location?: string;
  withWho?: string;
  studioId?: string | null;
  classType?: string | null;
  description?: string | null;
  image?: string | null;
  links?: BookingLink[];
  specificDate?: string | null;
  endsOn?: string | null;
  /** They saw the match and want their own entry anyway. */
  force?: boolean;
  // `id` comes back when exactly one row was written: the screen offers to
  // share it, and a picture needs to know which one. Several days at once is
  // several rows and no single answer.
}): Promise<{ ok: boolean; error?: string; match?: PersonalMatch; id?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false, error: "Give it a name." };
  const specificDate = input.specificDate?.trim() || null;
  if (specificDate && !/^\d{4}-\d{2}-\d{2}$/.test(specificDate))
    return { ok: false, error: "Pick a date." };
  // A one-off is one row, on the weekday its date lands on. Everything else is
  // a row per day picked.
  const days = specificDate
    ? [(new Date(`${specificDate}T00:00:00Z`).getUTCDay() + 6) % 7]
    : [...new Set(input.days ?? (input.dayOfWeek === undefined ? [] : [input.dayOfWeek]))];
  if (!days.length) return { ok: false, error: "Pick a day." };
  if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6))
    return { ok: false, error: "Pick a day." };
  if (!/^\d{2}:\d{2}$/.test(input.startTime)) return { ok: false, error: "Pick a time." };
  const durationMin = Math.round(input.durationMin);
  if (!(durationMin > 0 && durationMin <= 24 * 60)) return { ok: false, error: "Invalid length." };
  const endsOn = specificDate ? null : input.endsOn?.trim() || null;
  if (endsOn && !/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) return { ok: false, error: "Pick an end date." };

  const db = await getDb();

  // The studio has to be a real row in the directory, and the picker made it
  // there before this ran. Anything else is dropped rather than trusted.
  const [studio] = input.studioId
    ? await db.select().from(schema.studios).where(eq(schema.studios.id, input.studioId))
    : [];

  // If the class they're typing in already exists on fittlist (same day, same
  // start, similar name or place), offer the real one instead: it stays up to
  // date when the coach changes it, and the ghost copy is how the directory
  // rots. They can still say "mine anyway"; a home workout can share a slot.
  if (!input.force) {
    const fold = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const wantName = fold(name);
    const candidates = (
      await db
        .select()
        .from(schema.classes)
        .where(
          and(
            eq(schema.classes.dayOfWeek, days[0]),
            eq(schema.classes.startTime, input.startTime),
            eq(schema.classes.isPublic, true),
          ),
        )
    ).filter((c) => c.userId !== userId);
    if (candidates.length) {
      const hidden = await hiddenFrom(userId);
      const iso = (() => {
        const d = new Date(`${todayIso()}T00:00:00Z`);
        const today = (d.getUTCDay() + 6) % 7;
        d.setUTCDate(d.getUTCDate() + ((days[0] - today + 7) % 7));
        return d.toISOString().slice(0, 10);
      })();
      const hit = candidates.find((c) => {
        if (hidden.has(c.userId)) return false;
        if (!runsOn(c, iso, days[0])) return false;
        const haveName = fold(c.name);
        const nameClose =
          !!wantName && (haveName.includes(wantName) || wantName.includes(haveName));
        return nameClose;
      });
      if (hit) {
        const [coach] = await db
          .select({ name: schema.users.name, handle: schema.users.handle })
          .from(schema.users)
          .where(eq(schema.users.id, hit.userId));
        if (coach?.handle) {
          return {
            ok: false,
            match: {
              classId: hit.id,
              name: hit.name,
              coachName: coach.name,
              handle: coach.handle,
              iso,
            },
          };
        }
      }
    }
  }

  const mine = await db
    .select({ id: schema.personalClasses.id })
    .from(schema.personalClasses)
    .where(eq(schema.personalClasses.userId, userId));
  if (mine.length + days.length > MAX_ENTRIES)
    return { ok: false, error: "That's plenty for one week." };

  const classType = input.classType?.trim().slice(0, 40) || null;
  const description = input.description?.trim().slice(0, 600) || null;
  const image = await storeImage(input.image?.trim() || null, "class");
  const links = (input.links ?? [])
    .filter((l) => l?.url?.trim())
    .slice(0, 6)
    .map((l) => ({ label: String(l.label ?? "").slice(0, 40), url: String(l.url).slice(0, 500) }));

  const written = await db
    .insert(schema.personalClasses)
    .values(
      days.map((dayOfWeek) => ({
        userId,
        name,
        dayOfWeek,
        startTime: input.startTime,
        durationMin,
        // A studio owns the "where", exactly as it does on a coach's class, so
        // the free-text line is only ever the fallback.
        location: studio ? "" : (input.location?.trim().slice(0, 120) ?? ""),
        withWho: input.withWho?.trim().slice(0, 80) ?? "",
        studioId: studio?.id ?? null,
        classType,
        description,
        image,
        links,
        specificDate,
        endsOn,
      })),
    )
    .returning({ id: schema.personalClasses.id });

  // Into the studio's shared catalog, so the next person to add this class
  // gets the description and the picture rather than retyping them, and so a
  // studio that isn't here yet arrives in the directory with a real class on
  // it. Only with a studio: see the note at the top of this file.
  if (studio) {
    try {
      await db
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
    } catch (err) {
      console.error("studio catalog upsert failed", err);
    }
  }

  // And into your own catalog, so the next "Training with Kia" comes back
  // filled in. This is the same autofill memory a coach's published class
  // writes (one row per name, latest wins), and a personal entry is exactly
  // what `isPublic: false` on that table has always meant: yours, on your
  // own schedule, on nobody's public page. A schedule that is all over the
  // place but repeats is the thing this product is for, and retyping the
  // address of a client's home every week is how somebody stops bothering.
  try {
    await db
      .insert(schema.classTemplates)
      .values({
        userId,
        name,
        classType,
        description,
        image,
        startTime: input.startTime,
        durationMin,
        studioId: studio?.id ?? null,
        location: studio ? null : (input.location?.trim().slice(0, 120) || null),
        withWho: input.withWho?.trim().slice(0, 80) || null,
        isPublic: false,
        links,
      })
      .onConflictDoUpdate({
        target: [schema.classTemplates.userId, schema.classTemplates.name],
        set: {
          classType,
          description,
          image,
          startTime: input.startTime,
          durationMin,
          studioId: studio?.id ?? null,
          location: studio ? null : (input.location?.trim().slice(0, 120) || null),
          withWho: input.withWho?.trim().slice(0, 80) || null,
          isPublic: false,
          links,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    console.error("personal template upsert failed", err);
  }

  revalidatePath("/week");
  return { ok: true, id: written.length === 1 ? written[0].id : undefined };
}

export type PersonalDetail = {
  id: string;
  name: string;
  dayOfWeek: number;
  dayLabel: string;
  startTime: string;
  hm: string;
  ap: string;
  durationMin: number;
  location: string;
  withWho: string;
  studioId: string | null;
  studioName: string | null;
  classType: string | null;
  description: string | null;
  image: string | null;
  links: BookingLink[];
  specificDate: string | null;
  endsOn: string | null;
  /** The next date it runs, or null once it has been and gone. */
  nextIso: string | null;
};

/** One of your own entries, for the sheet that opens when you tap it. Scoped
 *  to the owner: nobody else has a reason to read it, and there is no page. */
export async function personalDetail(id: string): Promise<PersonalDetail | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const db = await getDb();
  const [p] = await db
    .select()
    .from(schema.personalClasses)
    .where(and(eq(schema.personalClasses.id, id), eq(schema.personalClasses.userId, userId)));
  if (!p) return null;
  const [studio] = p.studioId
    ? await db.select().from(schema.studios).where(eq(schema.studios.id, p.studioId))
    : [];
  const { hm, ap } = clockParts(p.startTime);
  const nextIso = personalNext(p);
  return {
    id: p.id,
    name: p.name,
    dayOfWeek: p.dayOfWeek,
    dayLabel: DAY_FULL[p.dayOfWeek] ?? "",
    startTime: p.startTime,
    hm,
    ap,
    durationMin: p.durationMin,
    location: p.location ?? "",
    withWho: p.withWho ?? "",
    studioId: p.studioId,
    studioName: studio?.name ?? null,
    classType: p.classType,
    description: p.description,
    image: p.image,
    links: p.links ?? [],
    specificDate: p.specificDate,
    endsOn: p.endsOn,
    nextIso,
  };
}

/**
 * Change one of your own entries.
 *
 * One row, edited in place: unlike a coach's weekly class this is never a set
 * of weekday rows sharing a series, so there is nothing to delete and reinsert
 * and no Going mark pointing at it. Moving it to another day moves this row.
 */
export async function updatePersonalClass(
  id: string,
  input: {
    name: string;
    days?: number[];
    dayOfWeek?: number;
    startTime: string;
    durationMin: number;
    location?: string;
    withWho?: string;
    studioId?: string | null;
    classType?: string | null;
    description?: string | null;
    image?: string | null;
    links?: BookingLink[];
    specificDate?: string | null;
    endsOn?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false, error: "Give it a name." };
  const specificDate = input.specificDate?.trim() || null;
  if (specificDate && !/^\d{4}-\d{2}-\d{2}$/.test(specificDate))
    return { ok: false, error: "Pick a date." };
  // One row stays one row, so an edit takes the first day picked rather than
  // fanning out into several. Same reasoning as a gym's rota slot.
  const dayOfWeek = specificDate
    ? (new Date(`${specificDate}T00:00:00Z`).getUTCDay() + 6) % 7
    : (input.days ?? (input.dayOfWeek === undefined ? [] : [input.dayOfWeek]))[0];
  if (dayOfWeek === undefined) return { ok: false, error: "Pick a day." };
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6)
    return { ok: false, error: "Pick a day." };
  if (!/^\d{2}:\d{2}$/.test(input.startTime)) return { ok: false, error: "Pick a time." };
  const durationMin = Math.round(input.durationMin);
  if (!(durationMin > 0 && durationMin <= 24 * 60)) return { ok: false, error: "Invalid length." };
  const endsOn = specificDate ? null : input.endsOn?.trim() || null;
  if (endsOn && !/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) return { ok: false, error: "Pick an end date." };

  const db = await getDb();
  const [studio] = input.studioId
    ? await db.select().from(schema.studios).where(eq(schema.studios.id, input.studioId))
    : [];

  const res = await db
    .update(schema.personalClasses)
    .set({
      name,
      dayOfWeek,
      startTime: input.startTime,
      durationMin,
      location: studio ? "" : (input.location?.trim().slice(0, 120) ?? ""),
      withWho: input.withWho?.trim().slice(0, 80) ?? "",
      studioId: studio?.id ?? null,
      classType: input.classType?.trim().slice(0, 40) || null,
      description: input.description?.trim().slice(0, 600) || null,
      image: await storeImage(input.image?.trim() || null, "class"),
      links: (input.links ?? [])
        .filter((l) => l?.url?.trim())
        .slice(0, 6)
        .map((l) => ({
          label: String(l.label ?? "").slice(0, 40),
          url: String(l.url).slice(0, 500),
        })),
      specificDate,
      endsOn,
    })
    .where(and(eq(schema.personalClasses.id, id), eq(schema.personalClasses.userId, userId)))
    .returning({ id: schema.personalClasses.id });
  if (!res.length) return { ok: false, error: "That class isn't there any more." };

  // Keep the memory current: an edit is the newest version of this entry, and
  // the catalog tracks latest the same way a coach's template does.
  try {
    const tName = name;
    const tType = input.classType?.trim().slice(0, 40) || null;
    const tDesc = input.description?.trim().slice(0, 600) || null;
    const tImage = await storeImage(input.image?.trim() || null, "class");
    const tLoc = studio ? null : (input.location?.trim().slice(0, 120) || null);
    const tWith = input.withWho?.trim().slice(0, 80) || null;
    const tLinks = (input.links ?? [])
      .filter((l) => l?.url?.trim())
      .slice(0, 6)
      .map((l) => ({ label: String(l.label ?? "").slice(0, 40), url: String(l.url).slice(0, 500) }));
    await db
      .insert(schema.classTemplates)
      .values({
        userId,
        name: tName,
        classType: tType,
        description: tDesc,
        image: tImage,
        startTime: input.startTime,
        durationMin,
        studioId: studio?.id ?? null,
        location: tLoc,
        withWho: tWith,
        isPublic: false,
        links: tLinks,
      })
      .onConflictDoUpdate({
        target: [schema.classTemplates.userId, schema.classTemplates.name],
        set: {
          classType: tType,
          description: tDesc,
          image: tImage,
          startTime: input.startTime,
          durationMin,
          studioId: studio?.id ?? null,
          location: tLoc,
          withWho: tWith,
          isPublic: false,
          links: tLinks,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    console.error("personal template upsert failed", err);
  }

  revalidatePath("/week");
  return { ok: true };
}

export async function removePersonalClass(id: string): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const db = await getDb();
  await db
    .delete(schema.personalClasses)
    .where(and(eq(schema.personalClasses.id, id), eq(schema.personalClasses.userId, userId)));
  // Both calendars carry these rows, so both have to be told. A coach's own
  // entries lived only on /app and survived every removal for want of this.
  revalidatePath("/week");
  revalidatePath("/app");
  return { ok: true };
}
