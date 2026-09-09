import QRCode from "qrcode";
import { eventStudio, eventSchedule } from "@/lib/event-data";
import { siteOrigin } from "@/lib/format";
export const dynamic="force-dynamic";
export async function GET(req:Request,{params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params, studio=await eventStudio(slug);
  if(!studio?.registrationPro || !studio.registrationDate)return new Response('Not found',{status:404});
  const query=new URL(req.url).searchParams;
  const classId=query.get('class'), date=query.get('d');
  const target=new URL(`/s/${encodeURIComponent(slug)}/register`,siteOrigin());
  if(classId) {
    const event=await eventSchedule(slug);
    if(!event || date!==event.date || !event.classes.some(c=>c.id===classId)) return new Response('Class not found',{status:404});
    target.searchParams.set('class',classId);target.searchParams.set('d',date!);
  }
  const svg=await QRCode.toString(target.toString(),{type:'svg',margin:3,errorCorrectionLevel:'M'});
  return new Response(svg,{headers:{'Content-Type':'image/svg+xml','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
