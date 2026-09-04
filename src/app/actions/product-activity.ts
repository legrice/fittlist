"use server";

import { and, count, eq, gte, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { todayIso } from "@/lib/format";
import {
  PRODUCT_ACTIVITY_KINDS,
  recordProductActivity,
  type ProductActivityKind,
} from "@/lib/product-activity";

export async function recordShareImageExport(): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) return;
  const kind: ProductActivityKind = "share_image_exported";
  if (!PRODUCT_ACTIVITY_KINDS.includes(kind)) return;
  await recordProductActivity(userId, kind);
}

export type MonthlyCalendarInsights = {
  month:string;
  attended:number;
  shareImages:number;
};

/** Small, private account totals for the calendar Insights sheet. */
export async function loadMonthlyCalendarInsights(): Promise<MonthlyCalendarInsights | null> {
  const userId=await getSessionUserId();
  if (!userId) return null;
  const today=todayIso();
  const [year,month]=today.split("-").map(Number);
  const from=`${year}-${String(month).padStart(2,"0")}-01`;
  const nextMonth=new Date(Date.UTC(year,month,1));
  const to=nextMonth.toISOString().slice(0,10);
  const tomorrow=new Date(`${today}T00:00:00.000Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
  const attendanceTo=tomorrow.toISOString().slice(0,10);
  const fromTime=new Date(`${from}T00:00:00.000Z`);
  const toTime=new Date(`${to}T00:00:00.000Z`);
  const db=await getDb();
  const [[attendance],[shares]]=await Promise.all([
    db.select({ value:count() }).from(schema.attendances).where(and(eq(schema.attendances.userId,userId),gte(schema.attendances.occurrenceDate,from),lt(schema.attendances.occurrenceDate,attendanceTo))),
    db.select({ value:count() }).from(schema.productActivity).where(and(eq(schema.productActivity.actorUserId,userId),eq(schema.productActivity.kind,"share_image_exported"),gte(schema.productActivity.createdAt,fromTime),lt(schema.productActivity.createdAt,toTime))),
  ]);
  return {
    month:new Date(`${from}T12:00:00.000Z`).toLocaleDateString("en-US",{ month:"long", year:"numeric", timeZone:"UTC" }),
    attended:Number(attendance?.value ?? 0),
    shareImages:Number(shares?.value ?? 0),
  };
}
