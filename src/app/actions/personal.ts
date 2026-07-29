"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { hiddenFrom } from "@/lib/blocks";
import { runsOn, todayIso } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";

// A member's own standing class. Private by construction: nothing here can
// make one public, so this whole file is allowed to be simple.

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
  dayOfWeek: number;
  startTime: string;
  durationMin: number;
  location?: string;
  withWho?: string;
  /** They saw the match and want their own entry anyway. */
  force?: boolean;
}): Promise<{ ok: boolean; error?: string; match?: PersonalMatch }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Log in first." };
  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false, error: "Give it a name." };
  if (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 0 || input.dayOfWeek > 6)
    return { ok: false, error: "Pick a day." };
  if (!/^\d{2}:\d{2}$/.test(input.startTime)) return { ok: false, error: "Pick a time." };
  const durationMin = Math.round(input.durationMin);
  if (!(durationMin > 0 && durationMin <= 24 * 60)) return { ok: false, error: "Invalid length." };

  const db = await getDb();

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
            eq(schema.classes.dayOfWeek, input.dayOfWeek),
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
        d.setUTCDate(d.getUTCDate() + ((input.dayOfWeek - today + 7) % 7));
        return d.toISOString().slice(0, 10);
      })();
      const hit = candidates.find((c) => {
        if (hidden.has(c.userId)) return false;
        if (!runsOn(c, iso, input.dayOfWeek)) return false;
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
  if (mine.length >= MAX_ENTRIES) return { ok: false, error: "That's plenty for one week." };

  await db.insert(schema.personalClasses).values({
    userId,
    name,
    dayOfWeek: input.dayOfWeek,
    startTime: input.startTime,
    durationMin,
    location: input.location?.trim().slice(0, 120) ?? "",
    withWho: input.withWho?.trim().slice(0, 80) ?? "",
  });
  revalidatePath("/week");
  return { ok: true };
}

export async function removePersonalClass(id: string): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Log in first." };
  const db = await getDb();
  await db
    .delete(schema.personalClasses)
    .where(and(eq(schema.personalClasses.id, id), eq(schema.personalClasses.userId, userId)));
  revalidatePath("/week");
  return { ok: true };
}
