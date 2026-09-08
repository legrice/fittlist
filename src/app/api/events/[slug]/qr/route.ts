import QRCode from "qrcode";
import { eventStudio } from "@/lib/event-data";
import { siteOrigin } from "@/lib/format";
export const dynamic="force-dynamic";
export async function GET(_req:Request,{params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params, studio=await eventStudio(slug);
  if(!studio?.registrationPro || !studio.registrationDate)return new Response('Not found',{status:404});
  const svg=await QRCode.toString(`${siteOrigin()}/s/${encodeURIComponent(slug)}/register`,{type:'svg',margin:3,errorCorrectionLevel:'M'});
  return new Response(svg,{headers:{'Content-Type':'image/svg+xml','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
