import { NextResponse } from "next/server";
export function GET() {
  const fingerprints=(process.env.ANDROID_APP_LINK_FINGERPRINTS || "").split(",").map(value=>value.trim().toUpperCase()).filter(Boolean);
  if (!fingerprints.length || fingerprints.some(value=>!/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(value))) return NextResponse.json({error:"Android app links are not configured"},{status:503,headers:{"Cache-Control":"no-store"}});
  return NextResponse.json([{relation:["delegate_permission/common.handle_all_urls"],target:{namespace:"android_app",package_name:"co.fittlist.app",sha256_cert_fingerprints:fingerprints}}],{headers:{"Cache-Control":"public, max-age=300"}});
}
