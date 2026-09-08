import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { dowOfDate, occurrenceEnded, runsOn } from "@/lib/format";
import { hiddenFrom } from "@/lib/blocks";
import { objectionableContentError } from "@/lib/content-safety";

export type RegistrationIntent = { studioId: string; classId: string; date: string; name: string };
export const uuidValid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function validEventDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
}
export async function validateRegistrationIntent(value: unknown): Promise<RegistrationIntent | null> {
  if (!value || typeof value !== "object") return null;
  const v = value as RegistrationIntent;
  if (!uuidValid(v.studioId) || !uuidValid(v.classId) || !validEventDate(v.date) || typeof v.name !== "string" || v.name.trim().length < 2 || v.name.length > 80 || objectionableContentError(v.name)) return null;
  const db = await getDb();
  const [studio] = await db.select().from(schema.studios).where(eq(schema.studios.id, v.studioId));
  const [cls] = await db.select().from(schema.classes).where(eq(schema.classes.id, v.classId));
  if (!studio || studio.registrationDate !== v.date || !cls || cls.userId !== studio.accountUserId || cls.studioId !== studio.id || !cls.isPublic || !cls.registrationCapacity || !runsOn(cls,v.date,dowOfDate(v.date))) return null;
  return {...v, name:v.name.trim()};
}

/** All ordinary saves and expo registrations share this row lock and limit. */
export async function writeAttendance(userId: string, classId: string, date: string, on: boolean, eventStudioId?: string, promote = false) {
  if (!uuidValid(classId) || !validEventDate(date) || typeof on !== "boolean") return {ok:false, error:"That class or date is invalid."};
  const blocked = await hiddenFrom(userId);
  const db = await getDb();
  return db.transaction(async tx => {
    const [cls] = await tx.select().from(schema.classes).where(eq(schema.classes.id,classId)).for("update");
    if (!cls || !cls.isPublic || blocked.has(cls.userId)) return {ok:false,error:"This class is no longer available."};
    if (cls.userId === userId || cls.coachUserId === userId) return {ok:false,error:"You can’t register for a class you teach."};
    const where = and(eq(schema.attendances.userId,userId),eq(schema.attendances.classId,classId),eq(schema.attendances.occurrenceDate,date));
    if (eventStudioId) {
      const [studio] = await tx.select().from(schema.studios).where(eq(schema.studios.id,eventStudioId));
      if (!studio || studio.registrationDate !== date || studio.accountUserId !== cls.userId || cls.studioId !== studio.id || !cls.registrationCapacity) return {ok:false,error:"Registration is not open for this class."};
    }
    const queueWhere = and(eq(schema.eventWaitlist.classId,classId),eq(schema.eventWaitlist.occurrenceDate,date));
    const ownQueue = and(queueWhere,eq(schema.eventWaitlist.userId,userId));
    if (!on) { await tx.delete(schema.attendances).where(where); await tx.delete(schema.eventWaitlist).where(ownQueue); return {ok:true,rsvp:cls.rsvp}; }
    if (!runsOn(cls,date,dowOfDate(date)) || occurrenceEnded(date,cls.startTime,cls.durationMin,cls.timeZone)) return {ok:false,error:"This class is no longer accepting registrations."};
    if (cls.studioId) {
      const [closed] = await tx.select({id:schema.studioClosedDays.id}).from(schema.studioClosedDays).where(and(eq(schema.studioClosedDays.studioId,cls.studioId),eq(schema.studioClosedDays.occurrenceDate,date)));
      if (closed) return {ok:false,error:"The space is closed on this date."};
    }
    const [already] = await tx.select({id:schema.attendances.id}).from(schema.attendances).where(where);
    if (already) return {ok:true,rsvp:cls.rsvp};
    if (cls.registrationCapacity !== null) {
      const [count] = await tx.select({n:sql<number>`count(*)::int`}).from(schema.attendances).where(and(eq(schema.attendances.classId,classId),eq(schema.attendances.occurrenceDate,date)));
      const [first] = await tx.select().from(schema.eventWaitlist).where(queueWhere).orderBy(schema.eventWaitlist.createdAt,schema.eventWaitlist.id).limit(1);
      if (promote && (!first || first.userId !== userId)) return {ok:false,error:"Confirm the first person on the waitlist. Refresh and try again."};
      if (count.n >= cls.registrationCapacity || (first && !promote)) {
        if (eventStudioId && cls.registrationWaitlist && !promote) {
          await tx.insert(schema.eventWaitlist).values({userId,classId,occurrenceDate:date}).onConflictDoNothing();
          return {ok:true,waitlisted:true,rsvp:cls.rsvp};
        }
        return {ok:false,error: first && count.n < cls.registrationCapacity ? "Available places are reserved for the waitlist. Contact the event team." : "This class is full. Please choose another class."};
      }
    }
    await tx.insert(schema.attendances).values({userId,classId,occurrenceDate:date,...(eventStudioId ? {isPublic:false} : {})}).onConflictDoNothing();
    await tx.delete(schema.eventWaitlist).where(ownQueue);
    return {ok:true,rsvp:cls.rsvp};
  });
}
export function csvCell(value: string | number) {
  const text = String(value);
  return `"${(/^[\s]*[=+\-@]/.test(text) ? "'" : "") + text.replace(/"/g,'""')}"`;
}
