"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { objectionableContentError } from "@/lib/content-safety";
import { getSessionUserId } from "@/lib/session";

import { canInteractWithCalendarActivity } from "@/lib/calendar-activity-access";
import { takeAnonymousActionRateLimit } from "@/lib/anonymous-rate-limit";
import { requestIpAddress } from "@/lib/request-ip";

type ActivityKind = "coaching" | "going";

function activityWhere(actorUserId:string,classId:string,occurrenceDate:string,activityKind:ActivityKind) {
  return and(
    eq(schema.calendarActivityLikes.actorUserId,actorUserId),
    eq(schema.calendarActivityLikes.classId,classId),
    eq(schema.calendarActivityLikes.occurrenceDate,occurrenceDate),
    eq(schema.calendarActivityLikes.activityKind,activityKind),
  );
}

export async function toggleCalendarActivityLike(actorUserId:string,classId:string,occurrenceDate:string,activityKind:ActivityKind) {
  const userId=await getSessionUserId();
  if (!userId) return { ok:false } as const;
  if (!await canInteractWithCalendarActivity(userId,actorUserId,classId,occurrenceDate,activityKind)) return { ok:false } as const;
  const db=await getDb();
  const where=and(activityWhere(actorUserId,classId,occurrenceDate,activityKind),eq(schema.calendarActivityLikes.userId,userId));
  const [existing]=await db.select({ id:schema.calendarActivityLikes.id }).from(schema.calendarActivityLikes).where(where).limit(1);
  if (existing) await db.delete(schema.calendarActivityLikes).where(eq(schema.calendarActivityLikes.id,existing.id));
  else await db.insert(schema.calendarActivityLikes).values({ actorUserId,classId,occurrenceDate,activityKind,userId }).onConflictDoNothing();
  revalidatePath("/calendar/following");
  return { ok:true, liked:!existing } as const;
}

export async function addCalendarActivityComment(actorUserId:string,classId:string,occurrenceDate:string,activityKind:ActivityKind,value:string) {
  const authorUserId=await getSessionUserId();
  if (!authorUserId) return { ok:false,error:"Sign in to comment." } as const;
  if (!await canInteractWithCalendarActivity(authorUserId,actorUserId,classId,occurrenceDate,activityKind)) return { ok:false,error:"That activity is no longer available." } as const;
  const body=typeof value === "string" ? value.trim() : "";
  if (!body || body.length>300) return { ok:false,error:"Keep comments between 1 and 300 characters." } as const;
  const unsafe=objectionableContentError(body);
  if (unsafe) return { ok:false,error:unsafe } as const;
  const db=await getDb();
  const allowed = await takeAnonymousActionRateLimit(db, {
    action: "calendar_comment", target: { kind: "user", id: authorUserId }, ip: await requestIpAddress(),
    limits: { target: { max: 12, windowMs: 60_000 } },
  });
  if (!allowed) return { ok:false,error:"Please wait a moment before commenting again." } as const;
  await db.insert(schema.calendarActivityComments).values({ actorUserId,classId,occurrenceDate,activityKind,authorUserId,body });
  revalidatePath("/calendar/following");
  return { ok:true } as const;
}
