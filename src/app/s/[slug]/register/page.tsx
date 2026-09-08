import { notFound } from "next/navigation";
import { eventSchedule } from "@/lib/event-data";
import { EventRegistration } from "@/components/EventRegistration";
export const dynamic = "force-dynamic";
export default async function EventPage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{class?:string;d?:string}>}) {
  const {slug} = await params, q = await searchParams;
  const event = await eventSchedule(slug);
  if(!event) notFound();
  return <EventRegistration event={event} selectedId={q.d && q.d!==event.date ? undefined : q.class} />;
}
