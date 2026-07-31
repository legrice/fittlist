"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { isBlocked } from "@/lib/blocks";
import { fmtDateLong, occurrenceEnded } from "@/lib/format";
import { mutualIds } from "@/lib/mutuals";
import { addNotification } from "@/lib/notify";
import { getSessionUserId } from "@/lib/session";

// Adding a class is a personal note, not a reservation. Nothing here talks to
// a studio's booking system, and the copy around it must never imply it does.
// The date matters: classes recur, so this marks one Tuesday, not every one.
export async function setGoing(
  classId: string,
  occurrenceDate: string,
  on: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Log in first." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) return { ok: false, error: "Bad date." };
  const db = await getDb();
  const [cls] = await db.select().from(schema.classes).where(eq(schema.classes.id, classId));
  if (!cls || !cls.isPublic) return { ok: false, error: "Class not found." };
  // Your own classes show up on your Home alongside the ones you follow, so
  // this is reachable — you teach it, you're not attending it.
  if (cls.userId === userId)
    return { ok: false, error: "You aren’t able to attend your own class." };
  // A coach who blocked you has no schedule as far as you're concerned, so
  // there's nothing here to add. Same wording as a class that isn't there.
  if (await isBlocked(cls.userId, userId)) return { ok: false, error: "Class not found." };
  // Adding is only ever forward. Taking one back out stays allowed whatever the
  // date: removing something you didn't get to isn't a thing to be stopped from
  // doing, and the list clears itself as the week passes anyway.
  if (on && occurrenceEnded(occurrenceDate, cls.startTime, cls.durationMin)) {
    return { ok: false, error: "That class has already started." };
  }

  if (on) {
    const inserted = await db
      .insert(schema.attendances)
      .values({ userId, classId, occurrenceDate })
      .onConflictDoNothing({
        target: [
          schema.attendances.userId,
          schema.attendances.classId,
          schema.attendances.occurrenceDate,
        ],
      })
      .returning({ id: schema.attendances.id });
    // "Alex is going too": tell the mutuals already marked for this same
    // occurrence. Mutuals only — one-way follows surface nothing — and only
    // on a real insert, so toggling can't drum on anyone. The dedupe check
    // keeps a remove-and-re-add from re-ringing the same bell.
    if (inserted.length) {
      try {
        const mutuals = await mutualIds(userId);
        if (mutuals.size) {
          const fellow = await db
            .select({ userId: schema.attendances.userId })
            .from(schema.attendances)
            .where(
              and(
                eq(schema.attendances.classId, classId),
                eq(schema.attendances.occurrenceDate, occurrenceDate),
                inArray(schema.attendances.userId, [...mutuals]),
              ),
            );
          if (fellow.length) {
            const [me] = await db
              .select({ name: schema.users.name, email: schema.users.email })
              .from(schema.users)
              .where(eq(schema.users.id, userId));
            const [coach] = await db
              .select({ handle: schema.users.handle })
              .from(schema.users)
              .where(eq(schema.users.id, cls.userId));
            const myName = me?.name.trim() || me?.email.split("@")[0] || "Someone";
            const body = `${cls.name} · ${fmtDateLong(occurrenceDate)}`;
            for (const f of fellow) {
              const [dupe] = await db
                .select({ id: schema.notifications.id })
                .from(schema.notifications)
                .where(
                  and(
                    eq(schema.notifications.userId, f.userId),
                    eq(schema.notifications.type, "going_together"),
                    eq(schema.notifications.actorUserId, userId),
                    eq(schema.notifications.body, body),
                  ),
                );
              if (dupe) continue;
              await addNotification(f.userId, {
                type: "going_together",
                title: `${myName} is going too`,
                body,
                href: coach?.handle ? `/${coach.handle}/${classId}?d=${occurrenceDate}` : null,
                actorUserId: userId,
              });
            }
          }
        }
      } catch (err) {
        // The mark itself always lands; the hello is best-effort.
        console.error("going-too notification failed", err);
      }
    }
  } else {
    await db
      .delete(schema.attendances)
      .where(
        and(
          eq(schema.attendances.userId, userId),
          eq(schema.attendances.classId, classId),
          eq(schema.attendances.occurrenceDate, occurrenceDate),
        ),
      );
  }
  revalidatePath("/feed");
  revalidatePath("/app");
  return { ok: true };
}

// Clean a companions list: names people typed, not data. Trimmed, deduped,
// capped so nobody can paste a novel into the coach's roster.
function cleanCompanions(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const name = r.trim().slice(0, 40);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
    if (out.length >= 10) break;
  }
  return out;
}

// "With Joanne and Dave" on your own mark. Yours to write and yours only:
// the update is scoped to your attendance row, and there has to be one.
export async function setGoingCompanions(
  classId: string,
  occurrenceDate: string,
  namesRaw: string[],
): Promise<{ ok: boolean; error?: string; companions?: string[] }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Log in first." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) return { ok: false, error: "Bad date." };
  const companions = cleanCompanions(Array.isArray(namesRaw) ? namesRaw : []);
  const db = await getDb();
  const updated = await db
    .update(schema.attendances)
    .set({ companions })
    .where(
      and(
        eq(schema.attendances.userId, userId),
        eq(schema.attendances.classId, classId),
        eq(schema.attendances.occurrenceDate, occurrenceDate),
      ),
    )
    .returning({ id: schema.attendances.id });
  if (!updated.length) return { ok: false, error: "Mark yourself going first." };
  revalidatePath("/feed");
  revalidatePath("/app");
  return { ok: true, companions };
}

// The faces for the invite picker: your mutuals, the only people the app
// will ever let you poke directly. Needs the avatar bits, so it joins users.
export async function myPeople(): Promise<
  { id: string; name: string; photo: string | null; color: string; handle: string | null }[]
> {
  const userId = await getSessionUserId();
  if (!userId) return [];
  const mutuals = await mutualIds(userId);
  if (!mutuals.size) return [];
  const db = await getDb();
  const rows = await db.select().from(schema.users).where(inArray(schema.users.id, [...mutuals]));
  const { avatarColor } = await import("@/lib/avatar");
  return rows
    .map((p) => ({
      id: p.id,
      name: p.name.trim() || p.email.split("@")[0],
      photo: p.photo,
      color: avatarColor(p),
      handle: p.handle,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Send "come with me" to chosen mutuals, as an in-app note. Every target is
// re-checked against the mutual set server-side, so the picker can't be
// talked into poking a stranger. Deduped per person per occurrence.
export async function inviteToClass(
  classId: string,
  occurrenceDate: string,
  targetIds: string[],
): Promise<{ ok: boolean; error?: string; sent?: number }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Log in first." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) return { ok: false, error: "Bad date." };
  const db = await getDb();
  const [mine] = await db
    .select({ id: schema.attendances.id })
    .from(schema.attendances)
    .where(
      and(
        eq(schema.attendances.userId, userId),
        eq(schema.attendances.classId, classId),
        eq(schema.attendances.occurrenceDate, occurrenceDate),
      ),
    );
  if (!mine) return { ok: false, error: "Mark yourself going first." };
  const [cls] = await db.select().from(schema.classes).where(eq(schema.classes.id, classId));
  if (!cls || !cls.isPublic) return { ok: false, error: "Class not found." };
  const mutuals = await mutualIds(userId);
  const targets = [...new Set(targetIds)].filter((t) => mutuals.has(t)).slice(0, 50);
  if (!targets.length) return { ok: true, sent: 0 };
  const [me] = await db
    .select({ name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  const [coach] = await db
    .select({ handle: schema.users.handle })
    .from(schema.users)
    .where(eq(schema.users.id, cls.userId));
  const myName = me?.name.trim() || me?.email.split("@")[0] || "Someone";
  const href = coach?.handle ? `/${coach.handle}/${classId}?d=${occurrenceDate}` : null;
  const body = `${cls.name} · ${fmtDateLong(occurrenceDate)}`;
  let sent = 0;
  for (const t of targets) {
    const [dupe] = await db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.userId, t),
          eq(schema.notifications.type, "class_invite"),
          eq(schema.notifications.actorUserId, userId),
          eq(schema.notifications.body, body),
        ),
      );
    if (dupe) continue;
    await addNotification(t, {
      type: "class_invite",
      title: `${myName} asked you to come along`,
      body,
      href,
      actorUserId: userId,
    });
    sent += 1;
  }
  return { ok: true, sent };
}
