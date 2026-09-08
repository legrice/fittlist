import { and, eq, inArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentUser } from "@/lib/current-user";
import { studioAccess } from "@/lib/studioaccess";
import { dowOfDate, runsOn, occurrenceEnded } from "@/lib/format";
import { uuidValid } from "@/lib/event-registration";
import { hiddenFrom } from "@/lib/blocks";

export async function eventStudio(key: string) {
  const db = await getDb();
  const [studio] = await db.select().from(schema.studios).where(uuidValid(key) ? or(eq(schema.studios.slug,key),eq(schema.studios.id,key)) : eq(schema.studios.slug,key));
  return studio ?? null;
}
export async function eventAdmin(key: string) {
  const studio = await eventStudio(key), me = await currentUser();
  if (!studio || !me || !(await studioAccess(studio.id,me)).isManager) return null;
  return {studio,me};
}
export async function eventSchedule(key: string, admin = false, previewDate?: string) {
  const studio = await eventStudio(key);
  if (!studio) return null;
  const db = await getDb(), me = await currentUser();
  if (admin && (!me || !(await studioAccess(studio.id,me)).isManager)) return null;
  const date = admin && previewDate ? previewDate : studio.registrationDate;
  const rows = studio.accountUserId && date ? await db.select().from(schema.classes).where(and(eq(schema.classes.userId,studio.accountUserId),eq(schema.classes.studioId,studio.id))).orderBy(schema.classes.startTime).limit(501) : [];
  const blocked = await hiddenFrom(me?.id ?? null);
  const candidates = rows.filter(c=>date && runsOn(c,date,dowOfDate(date)) && (admin || (c.isPublic && !!c.registrationCapacity && !blocked.has(c.userId))));
  const ids = candidates.map(c=>c.id);
  const counts = date && ids.length ? await db.select({classId:schema.attendances.classId,n:sql<number>`count(*)::int`,checked:sql<number>`count(${schema.attendances.checkedInAt})::int`}).from(schema.attendances).where(and(inArray(schema.attendances.classId,ids),eq(schema.attendances.occurrenceDate,date))).groupBy(schema.attendances.classId) : [];
  const waiting = date && ids.length ? await db.select({classId:schema.eventWaitlist.classId,n:sql<number>`count(*)::int`}).from(schema.eventWaitlist).where(and(inArray(schema.eventWaitlist.classId,ids),eq(schema.eventWaitlist.occurrenceDate,date))).groupBy(schema.eventWaitlist.classId) : [];
  const ownWaiting = me && date && ids.length ? await db.select({classId:schema.eventWaitlist.classId}).from(schema.eventWaitlist).where(and(eq(schema.eventWaitlist.userId,me.id),inArray(schema.eventWaitlist.classId,ids),eq(schema.eventWaitlist.occurrenceDate,date))) : [];
  const own = me && date && ids.length ? await db.select({classId:schema.attendances.classId}).from(schema.attendances).where(and(eq(schema.attendances.userId,me.id),inArray(schema.attendances.classId,ids),eq(schema.attendances.occurrenceDate,date))) : [];
  const [closed] = date ? await db.select({id:schema.studioClosedDays.id}).from(schema.studioClosedDays).where(and(eq(schema.studioClosedDays.studioId,studio.id),eq(schema.studioClosedDays.occurrenceDate,date))) : [];
  const [unique] = date && ids.length ? await db.select({n:sql<number>`count(distinct ${schema.attendances.userId})::int`}).from(schema.attendances).where(and(inArray(schema.attendances.classId,ids),eq(schema.attendances.occurrenceDate,date))) : [];
  return {id:studio.id,slug:studio.slug || studio.id,name:studio.name,address:studio.address,date,timeZone:studio.timeZone,closed:!!closed,signedIn:!!me,viewerName:me?.name || "",uniqueAttendees:admin ? unique?.n ?? 0 : 0,truncated:rows.length>500,
    classes:candidates.map(c=>({id:c.id,name:c.name,time:c.startTime,duration:c.durationMin,location:c.location || studio.address,description:c.description,capacity:c.registrationCapacity,waitlistEnabled:c.registrationWaitlist,waiting:waiting.find(r=>r.classId===c.id)?.n ?? 0,waitlisted:ownWaiting.some(r=>r.classId===c.id),count:counts.find(r=>r.classId===c.id)?.n ?? 0,checked:admin ? counts.find(r=>r.classId===c.id)?.checked ?? 0 : 0,registered:own.some(r=>r.classId===c.id),past:date ? occurrenceEnded(date,c.startTime,c.durationMin,c.timeZone) : false,public:c.isPublic}))};
}
export type EventSchedule = NonNullable<Awaited<ReturnType<typeof eventSchedule>>>;

export async function eventRoster(key: string, classId?: string) {
  const admin = await eventAdmin(key);
  if (!admin || !admin.studio.registrationDate || !admin.studio.accountUserId) return null;
  const db = await getDb(), {studio} = admin;
  return db.select({id:schema.attendances.id,name:schema.users.name,email:schema.users.email,classId:schema.classes.id,className:schema.classes.name,time:schema.classes.startTime,date:schema.attendances.occurrenceDate,checkedInAt:schema.attendances.checkedInAt})
    .from(schema.attendances).innerJoin(schema.classes,eq(schema.classes.id,schema.attendances.classId)).innerJoin(schema.users,eq(schema.users.id,schema.attendances.userId))
    .where(and(eq(schema.classes.studioId,studio.id),eq(schema.classes.userId,studio.accountUserId!),eq(schema.attendances.occurrenceDate,studio.registrationDate!),classId ? eq(schema.classes.id,classId) : undefined))
    .orderBy(schema.classes.startTime,schema.users.name).limit(10001);
}

export async function eventWaitingRoster(key: string) {
  const admin = await eventAdmin(key);
  if (!admin || !admin.studio.registrationDate || !admin.studio.accountUserId) return null;
  const db=await getDb(), {studio}=admin;
  return db.select({id:schema.eventWaitlist.id,userId:schema.eventWaitlist.userId,name:schema.users.name,email:schema.users.email,classId:schema.classes.id,className:schema.classes.name,time:schema.classes.startTime,date:schema.eventWaitlist.occurrenceDate})
    .from(schema.eventWaitlist).innerJoin(schema.classes,eq(schema.classes.id,schema.eventWaitlist.classId)).innerJoin(schema.users,eq(schema.users.id,schema.eventWaitlist.userId))
    .where(and(eq(schema.classes.studioId,studio.id),eq(schema.classes.userId,studio.accountUserId!),eq(schema.eventWaitlist.occurrenceDate,studio.registrationDate!)))
    .orderBy(schema.eventWaitlist.createdAt,schema.eventWaitlist.id).limit(10001);
}
