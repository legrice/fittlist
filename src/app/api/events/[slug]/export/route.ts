import { eventRoster, eventWaitingRoster } from "@/lib/event-data";
import { csvCell } from "@/lib/event-registration";
export const dynamic="force-dynamic";
export async function GET(_req:Request,{params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params, [roster,waiting]=await Promise.all([eventRoster(slug),eventWaitingRoster(slug)]);
  const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
  if(!roster || !waiting)return new Response('Not found',{status:404,headers});
  if(roster.length+waiting.length>10000)return new Response('Export exceeds 10,000 registrations. Contact support for a complete export.',{status:413,headers});
  const rows=[['Name','Email','Class','Date','Time','Checked in','Status'],...roster.map(r=>[r.name,r.email,r.className,r.date,r.time,r.checkedInAt ? 'Yes' : 'No','Confirmed']),...waiting.map(r=>[r.name,r.email,r.className,r.date,r.time,'No','Waitlisted'])];
  return new Response('\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n'),{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="event-registrations.csv"'}});
}
