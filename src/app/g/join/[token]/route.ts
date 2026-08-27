import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { hiddenFrom } from "@/lib/blocks";

const COOKIE = "fl_group_join";

export async function GET(request: Request, { params }: { params:Promise<{token:string}> }) {
  const { token:raw } = await params;
  const token=raw.trim().toLowerCase();
  const db=await getDb();
  const [group]=/^[a-f0-9]{32,64}$/.test(token)?await db.select({id:schema.groups.id,slug:schema.groups.slug,ownerUserId:schema.groups.ownerUserId}).from(schema.groups).where(eq(schema.groups.inviteToken,token)):[];
  const userId=await getSessionUserId();
  if(!group){const response=NextResponse.redirect(new URL(userId?"/saved":"/",request.url));response.cookies.delete(COOKIE);return response;}
  if(!userId){const next=`/g/join/${token}`;const response=NextResponse.redirect(new URL(`/?join=signup&next=${encodeURIComponent(next)}`,request.url));response.cookies.set(COOKIE,token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:30*24*60*60});return response;}
  if(group.ownerUserId!==userId&&(await hiddenFrom(userId)).has(group.ownerUserId)){
    const response=NextResponse.redirect(new URL("/saved",request.url));
    response.cookies.delete(COOKIE);
    return response;
  }
  const [member]=await db.select({id:schema.groupMembers.id}).from(schema.groupMembers).where(and(eq(schema.groupMembers.groupId,group.id),eq(schema.groupMembers.userId,userId)));
  if(!member&&group.ownerUserId!==userId)await db.insert(schema.groupInvitations).values({groupId:group.id,inviteeUserId:userId,invitedByUserId:group.ownerUserId,role:"member"}).onConflictDoNothing();
  const response=NextResponse.redirect(new URL(`/g/${group.slug}`,request.url));
  response.cookies.delete(COOKIE);
  return response;
}
