"use server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { eventAdmin, eventRoster, eventWaitingRoster, eventSchedule, eventStudio } from "@/lib/event-data";
import { validEventDate, uuidValid, writeAttendance } from "@/lib/event-registration";
import { dowOfDate, runsOn } from "@/lib/format";

export async function registerForEvent(slug: string, classId: string, date: string, on = true) {
  const userId = await getSessionUserId();
  if (!userId) return {ok:false,error:"Sign in to register."};
  const studio = await eventStudio(slug);
  if (!studio || studio.registrationDate !== date) return {ok:false,error:"Registration is closed for this date."};
  try {
    const result = await writeAttendance(userId,classId,date,on,studio.id);
    revalidatePath(`/s/${slug}/register`); revalidatePath(`/s/${slug}/manage/registrations`); revalidatePath('/calendar');
    return result;
  } catch {return {ok:false,error:"We couldn’t save that. Please try again."};}
}
export async function refreshEvent(slug: string) { return eventSchedule(slug); }
export async function saveEventSettings(slug: string, date: string, capacities: {id:string;capacity:number;waitlist?:boolean}[]) {
  const admin = await eventAdmin(slug);
  if (!admin) return {ok:false,error:"Only this space’s admins can manage registrations."};
  if (!validEventDate(date) || !Array.isArray(capacities) || capacities.length>500 || capacities.some(c=>!uuidValid(c.id) || (c.waitlist !== undefined && typeof c.waitlist !== "boolean") || !Number.isInteger(c.capacity) || c.capacity<1 || c.capacity>1000)) return {ok:false,error:"Choose a date and capacities between 1 and 1,000."};
  const db = await getDb();
  try {
    await db.transaction(async tx=>{
      // Stable lock order is shared by all capacity edits.
      const classes = admin.studio.accountUserId ? await tx.select().from(schema.classes).where(and(eq(schema.classes.studioId,admin.studio.id),eq(schema.classes.userId,admin.studio.accountUserId))).orderBy(schema.classes.id).for("update") : [];
      if (capacities.some(c=>!classes.some(r=>r.id===c.id && runsOn(r,date,dowOfDate(date))))) throw Error("A selected class is no longer on this date. Refresh and try again.");
      for(const setting of capacities) {
        const [count] = await tx.select({n:sql<number>`count(*)::int`}).from(schema.attendances).where(and(eq(schema.attendances.classId,setting.id),eq(schema.attendances.occurrenceDate,date)));
        if(count.n>setting.capacity) throw Error("A capacity cannot be lower than the number already registered.");
        await tx.update(schema.classes).set({registrationCapacity:setting.capacity,...(setting.waitlist !== undefined ? {registrationWaitlist:setting.waitlist} : {}),rsvp:true}).where(eq(schema.classes.id,setting.id));
      }
      if(admin.studio.registrationDate && admin.studio.registrationDate!==date && classes.length) {
        const [count] = await tx.select({n:sql<number>`count(*)::int`}).from(schema.attendances).where(and(inArray(schema.attendances.classId,classes.map(c=>c.id)),eq(schema.attendances.occurrenceDate,admin.studio.registrationDate)));
        const [waiting] = await tx.select({n:sql<number>`count(*)::int`}).from(schema.eventWaitlist).where(and(inArray(schema.eventWaitlist.classId,classes.map(c=>c.id)),eq(schema.eventWaitlist.occurrenceDate,admin.studio.registrationDate)));
        if(count.n || waiting.n) throw Error("This event already has registrations. Keep its date and create a separate event space for another date.");
      }
      await tx.update(schema.studios).set({registrationDate:date}).where(eq(schema.studios.id,admin.studio.id));
    });
    revalidatePath(`/s/${slug}/manage/registrations`);revalidatePath(`/s/${slug}/register`);
    return {ok:true};
  } catch(error) {const safeMessages = ["A selected class is no longer on this date. Refresh and try again.", "A capacity cannot be lower than the number already registered.", "This event already has registrations. Keep its date and create a separate event space for another date."];
    return {ok:false,error:error instanceof Error && safeMessages.includes(error.message) ? error.message : "Couldn’t update registration settings. Try again."};}
}
export async function checkInEvent(slug: string, attendanceId: string, checked: boolean) {
  const admin = await eventAdmin(slug);
  if (!admin || !uuidValid(attendanceId) || typeof checked !== 'boolean') return {ok:false,error:"You cannot change this registration."};
  const db = await getDb();
  const [entry] = await db.select({classId:schema.classes.id,date:schema.attendances.occurrenceDate}).from(schema.attendances).innerJoin(schema.classes,eq(schema.classes.id,schema.attendances.classId)).where(and(eq(schema.attendances.id,attendanceId),eq(schema.classes.studioId,admin.studio.id),eq(schema.classes.userId,admin.studio.accountUserId || admin.studio.id)));
  if(!entry || entry.date!==admin.studio.registrationDate) return {ok:false,error:"Registration not found."};
  await db.update(schema.attendances).set({checkedInAt:checked ? new Date() : null}).where(eq(schema.attendances.id,attendanceId));
  revalidatePath(`/s/${slug}/manage/registrations`);return {ok:true};
}

export async function promoteEventWaitlist(slug:string, entryId:string) {
  const admin=await eventAdmin(slug);
  if(!admin || !uuidValid(entryId)) return {ok:false,error:"Only this space’s admins can confirm waitlisted attendees."};
  const db=await getDb();
  const [entry]=await db.select().from(schema.eventWaitlist).where(eq(schema.eventWaitlist.id,entryId));
  if(!entry || entry.occurrenceDate!==admin.studio.registrationDate) return {ok:false,error:"Waitlist entry no longer available. Refresh the list."};
  try {
    const result=await writeAttendance(entry.userId,entry.classId,entry.occurrenceDate,true,admin.studio.id,true);
    revalidatePath(`/s/${slug}/manage/registrations`);revalidatePath(`/s/${slug}/register`);revalidatePath('/calendar');
    return result;
  } catch {return {ok:false,error:"Couldn’t confirm this place. Refresh and try again."};}
}

export async function removeEventWaitlist(slug:string, entryId:string) {
  const admin=await eventAdmin(slug);
  if(!admin || !uuidValid(entryId)) return {ok:false,error:"Only this space’s admins can manage the waitlist."};
  const db=await getDb();
  try {
    await db.transaction(async tx=>{
      const [entry]=await tx.select({classId:schema.classes.id}).from(schema.eventWaitlist).innerJoin(schema.classes,eq(schema.classes.id,schema.eventWaitlist.classId)).where(and(eq(schema.eventWaitlist.id,entryId),eq(schema.classes.studioId,admin.studio.id),eq(schema.classes.userId,admin.studio.accountUserId || admin.studio.id),eq(schema.eventWaitlist.occurrenceDate,admin.studio.registrationDate || "0001-01-01")));
      if(!entry) return;
      await tx.select({id:schema.classes.id}).from(schema.classes).where(eq(schema.classes.id,entry.classId)).for("update");
      await tx.delete(schema.eventWaitlist).where(eq(schema.eventWaitlist.id,entryId));
    });
    revalidatePath(`/s/${slug}/manage/registrations`);revalidatePath(`/s/${slug}/register`);return {ok:true};
  } catch {return {ok:false,error:"Couldn’t remove this waitlist entry. Try again."};}
}

export async function refreshEventDesk(slug:string,date:string) {
  if(!validEventDate(date))return null;
  const admin=await eventAdmin(slug);if(!admin)return null;
  const [event,roster,waiting]=await Promise.all([eventSchedule(slug,true,date),eventRoster(slug),eventWaitingRoster(slug)]);
  if(!event || !roster || !waiting)return null;
  return {event,roster:roster.slice(0,10000).map(r=>({...r,checkedInAt:r.checkedInAt?.toISOString() ?? null})),waiting,rosterTruncated:roster.length>10000,publishedDate:admin.studio.registrationDate};
}
