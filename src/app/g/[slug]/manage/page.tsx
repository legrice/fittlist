import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { currentUser } from "@/lib/current-user";
import { AppChrome } from "@/components/AppChrome";
import { GroupMembers, GroupSettings } from "@/components/GroupSetup";
import { ProfileBannerSetting } from "@/components/ProfileBannerSetting";
import { groupInvitePeople } from "@/app/actions/you";
import { avatarColor } from "@/lib/avatar";
import { hiddenFrom } from "@/lib/blocks";
import { viewerLook } from "@/lib/look";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";
export default async function GroupManagePage({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params;
  const me=await currentUser();if(!me)notFound();
  const db=await getDb();
  const [group]=await db.select().from(schema.groups).where(eq(schema.groups.slug,slug));if(!group)notFound();
  const [membership]=await db.select().from(schema.groupMembers).where(and(eq(schema.groupMembers.groupId,group.id),eq(schema.groupMembers.userId,me.id)));
  const hidden=await hiddenFrom(me.id);
  if(group.ownerUserId!==me.id && (hidden.has(group.ownerUserId) || !["owner","admin"].includes(membership?.role || "")))notFound();
  const [people,rows]=await Promise.all([groupInvitePeople(),db.select({id:schema.users.id,name:schema.users.name,photo:schema.users.photoThumb,avatarColor:schema.users.avatarColor,role:schema.groupMembers.role}).from(schema.groupMembers).innerJoin(schema.users,eq(schema.users.id,schema.groupMembers.userId)).where(eq(schema.groupMembers.groupId,group.id))]);
  const members=rows.filter(row=>!hidden.has(row.id)).map(row=>({...row,color:avatarColor(row)}));
  return <section className="screen hasnav" data-mode={await viewerLook()}><div className="pad studio-manage-shell"><AppChrome userId={me.id} bar active="calendar" social/><main className="studio-dashboard group-admin-center">
    <header className="group-admin-heading"><Link href={`/g/${slug}`}>← View group</Link><h1>{group.name}</h1><p>Group admin center</p></header>
    <div className="studio-dashboard-grid">
      <Link className="studio-dashboard-card" href={`/g/${slug}`}><span className="studio-dashboard-card-icon"><Icon name="calendar_month" size={28}/></span><span className="studio-dashboard-card-copy"><strong>Calendar</strong><small>View the schedule and add classes</small></span><Icon name="arrow_forward" size={22}/></Link>
      <Link className="studio-dashboard-card" href={`/g/${slug}?tab=updates`}><span className="studio-dashboard-card-icon"><Icon name="chat_bubble" size={28}/></span><span className="studio-dashboard-card-copy"><strong>Updates</strong><small>Share news with your group</small></span><Icon name="arrow_forward" size={22}/></Link>
    </div>
    <section className="group-admin-panel"><h2>Profile and settings</h2><GroupSettings slug={slug} name={group.name} photo={group.photo} description={group.description || ""} visibility={group.visibility as "public"|"unlisted"|"private"} people={people} pill/><ProfileBannerSetting groupId={group.id}/></section>
    <section className="group-admin-panel"><GroupMembers slug={slug} inviteToken={group.inviteToken} members={members} people={people} canManage viewerId={me.id} viewerRole={group.ownerUserId===me.id ? "owner" : membership!.role}/></section>
  </main></div></section>;
}
