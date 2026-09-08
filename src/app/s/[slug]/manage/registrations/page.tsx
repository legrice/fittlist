import { notFound } from "next/navigation";
import { eventAdmin, eventRoster, eventSchedule } from "@/lib/event-data";
import { validEventDate } from "@/lib/event-registration";
import { EventRegistrationDesk } from "@/components/EventRegistrationDesk";
export const dynamic = "force-dynamic";
export const metadata = {title:"Event registration desk · FittList",robots:{index:false,follow:false}};
export default async function RegistrationDeskPage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{date?:string}>}) {
  const {slug} = await params, q = await searchParams;
  const admin=await eventAdmin(slug);if(!admin)notFound();
  const date=validEventDate(q.date) ? q.date : admin.studio.registrationDate || "2026-09-12";
  const [event,roster]=await Promise.all([eventSchedule(slug,true,date),eventRoster(slug)]);
  if(!event)notFound();
  return <EventRegistrationDesk key={date} event={event} roster={(roster || []).slice(0,10000).map(r=>({...r,checkedInAt:r.checkedInAt?.toISOString() ?? null}))} rosterTruncated={(roster?.length ?? 0)>10000} publishedDate={admin.studio.registrationDate} />;
}
