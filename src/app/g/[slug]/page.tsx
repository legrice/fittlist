import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { avatarColor } from "@/lib/avatar";
import { clockParts, fmtDayHeaderRel, todayIso } from "@/lib/format";
import { AppChrome } from "@/components/AppChrome";
import { PublicTopBar } from "@/components/PublicTopBar";
import { GroupActions, GroupShareButton } from "@/components/GroupActions";
import { GroupAddClass, GroupMembers, GroupSettings } from "@/components/GroupSetup";
import { Icon } from "@/components/Icon";
import { CalendarList, type WeekDayRows } from "@/components/WeekView";
import { ClassOpener } from "@/components/ClassOpener";
import { groupClassOptions, type GroupPurpose } from "@/app/actions/groups";
import { youDashboardData } from "@/app/actions/you";
import { GroupHub, type GroupUpdate } from "@/components/GroupUpdates";

export const dynamic = "force-dynamic";

export default async function GroupPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams:Promise<{tab?:string;from?:string}> }) {
  const { slug } = await params;
  const { tab, from } = await searchParams;
  const db = await getDb();
  const [group] = await db.select().from(schema.groups).where(eq(schema.groups.slug, slug));
  if (!group) notFound();
  const viewerId = await getSessionUserId();
  const [membership] = viewerId ? await db.select().from(schema.groupMembers).where(and(eq(schema.groupMembers.groupId, group.id), eq(schema.groupMembers.userId, viewerId))) : [];
  const [invitation] = viewerId ? await db.select({ role: schema.groupInvitations.role }).from(schema.groupInvitations).where(and(eq(schema.groupInvitations.groupId, group.id), eq(schema.groupInvitations.inviteeUserId, viewerId))) : [];
  if (group.visibility === "private" && !membership && !invitation) notFound();
  const manager = group.ownerUserId === viewerId || membership?.role === "owner" || membership?.role === "admin";
  const [dashboard, setupClasses] = manager ? await Promise.all([youDashboardData(), groupClassOptions()]) : [null, []];
  const [favorite] = viewerId ? await db.select({ id: schema.groupFavorites.id }).from(schema.groupFavorites).where(and(eq(schema.groupFavorites.groupId, group.id), eq(schema.groupFavorites.userId, viewerId))) : [];
  const memberRows = await db.select({ id: schema.users.id, name: schema.users.name, photo: schema.users.photo, avatarColor: schema.users.avatarColor, role: schema.groupMembers.role }).from(schema.groupMembers).innerJoin(schema.users, eq(schema.groupMembers.userId, schema.users.id)).where(eq(schema.groupMembers.groupId, group.id));
  const selections = await db.select().from(schema.groupClasses).where(eq(schema.groupClasses.groupId, group.id));
  const classRows = selections.length ? await db.select().from(schema.classes).where(inArray(schema.classes.id, selections.map((item) => item.classId))) : [];
  const classById = new Map(classRows.map((item) => [item.id, item]));
  const coachIds = [...new Set(classRows.map((item) => item.userId))];
  const coaches = coachIds.length ? await db.select().from(schema.users).where(inArray(schema.users.id, coachIds)) : [];
  const coachById = new Map(coaches.map((item) => [item.id, item]));
  const studioIds = [...new Set(classRows.map((item) => item.studioId).filter((id): id is string => !!id))];
  const studios = studioIds.length ? await db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds)) : [];
  const studioById = new Map(studios.map((item) => [item.id, item]));
  const today = todayIso();
  const byDay = new Map<string, WeekDayRows["rows"]>();
  for (const selection of selections) {
    const item = classById.get(selection.classId);
    if (!item || selection.occurrenceDate < today) continue;
    const coach = coachById.get(item.userId);
    const studio = item.studioId ? studioById.get(item.studioId) : null;
    const base = coach?.handle ?? (studio?.slug ? `s/${studio.slug}` : null);
    if (!base) continue;
    const time = clockParts(item.startTime);
    const rows = byDay.get(selection.occurrenceDate) ?? [];
    rows.push({ key: selection.id, name: item.name, where: studio?.name ?? item.location, hm: time.hm, ap: time.ap, dur: `${item.durationMin} min`, coach: coach ? { id: coach.id, name: coach.name, photo: coach.photo, color: avatarColor(coach) } : null, href: `/${base}/${item.id}?d=${selection.occurrenceDate}`, classId: item.id, iso: selection.occurrenceDate, base });
    byDay.set(selection.occurrenceDate, rows);
  }
  const days: WeekDayRows[] = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([iso, rows]) => ({ iso, label: fmtDayHeaderRel(iso, today), today: iso === today, rows }));
  const emptyCopy: Record<GroupPurpose, string> = { plan: "Add a class you’re going to and invite people to join you.", community: "Add the first class or session to start the community calendar.", event: "Add the first class, session, or meetup to build the event schedule." };
  const purpose = (["plan", "community", "event"].includes(group.purpose) ? group.purpose : "plan") as GroupPurpose;
  const postRows = await db.select().from(schema.groupPosts).where(eq(schema.groupPosts.groupId, group.id)).orderBy(desc(schema.groupPosts.createdAt)).limit(50);
  const postIds = postRows.map((post) => post.id);
  const [commentRows,reactionRows,savedRows] = await Promise.all([
    postIds.length ? db.select().from(schema.groupPostComments).where(inArray(schema.groupPostComments.postId,postIds)) : [],
    postIds.length ? db.select().from(schema.groupPostReactions).where(inArray(schema.groupPostReactions.postId,postIds)) : [],
    viewerId ? db.select({classId:schema.attendances.classId,iso:schema.attendances.occurrenceDate}).from(schema.attendances).where(eq(schema.attendances.userId,viewerId)) : [],
  ]);
  const updateAuthorIds=[...new Set([...postRows.map((row)=>row.authorUserId),...commentRows.map((row)=>row.authorUserId)])];
  const updateAuthors=updateAuthorIds.length ? await db.select().from(schema.users).where(inArray(schema.users.id,updateAuthorIds)) : [];
  const updateAuthorById=new Map(updateAuthors.map((person)=>[person.id,person]));
  const savedSet=new Set(savedRows.map((row)=>`${row.classId}|${row.iso}`));
  const updates:GroupUpdate[]=postRows.flatMap((post)=>{
    const author=updateAuthorById.get(post.authorUserId); if(!author) return [];
    const cls=post.classId ? classById.get(post.classId) : null; const studio=cls?.studioId ? studioById.get(cls.studioId) : null;
    const time=cls ? clockParts(cls.startTime) : null;
    const reactionKinds=["heart","strong","in"].map((reaction)=>({reaction,count:reactionRows.filter((row)=>row.postId===post.id&&row.reaction===reaction).length,mine:reactionRows.some((row)=>row.postId===post.id&&row.reaction===reaction&&row.userId===viewerId)}));
    return [{ id:post.id,kind:post.kind,body:post.body,createdAt:post.createdAt.toISOString(),author:{name:author.name,photo:author.photoThumb??author.photo,color:avatarColor(author)},cls:cls&&post.occurrenceDate&&time?{id:cls.id,iso:post.occurrenceDate,name:cls.name,detail:`${new Date(`${post.occurrenceDate}T00:00:00Z`).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",timeZone:"UTC"})} · ${time.hm} ${time.ap}`,where:studio?.name??cls.location??"Location to come",saved:savedSet.has(`${cls.id}|${post.occurrenceDate}`)}:null,comments:commentRows.filter((row)=>row.postId===post.id).map((row)=>{const person=updateAuthorById.get(row.authorUserId)!;return{id:row.id,body:row.body,author:{name:person.name,photo:person.photoThumb??person.photo,color:avatarColor(person)}}}),reactions:reactionKinds }];
  });
  const settingsMembers = memberRows.map((member) => ({ id:member.id, name:member.name, photo:member.photo, color:avatarColor(member), role:member.role }));
  const schedule = <section className="group-section group-schedule-section"><div className="group-section-head"><h2>Schedule</h2>{manager && days.length > 0 && <GroupAddClass slug={slug} classes={setupClasses} />}</div>{days.length ? <ClassOpener handle=""><CalendarList days={days} /></ClassOpener> : <div className="empty-block group-schedule-empty"><h2>Nothing planned yet</h2><p>{emptyCopy[purpose]}</p>{manager && <GroupAddClass slug={slug} classes={setupClasses} />}</div>}</section>;
  const members = <GroupMembers slug={slug} members={settingsMembers} people={dashboard?.people ?? []} canManage={manager} viewerId={viewerId} viewerRole={membership?.role ?? (group.ownerUserId===viewerId?"owner":null)}/>;
  const initialTab = tab === "updates" ? "updates" : tab === "members" ? "members" : "schedule";
  const backHref=from==="discover-groups"?"/discover?half=groups":"/saved";
  return <div className="pub group-page hasnav"><div className="profwrap">{viewerId ? <AppChrome userId={viewerId} /> : <PublicTopBar next={`/g/${slug}`} />}<main className="group-main"><header className="group-hero"><div className="group-hero-media">{group.photo?<img src={group.photo} alt=""/>:<span style={{background:avatarColor({id:group.id})}}/>}<span className="group-hero-dim" aria-hidden="true"/><Link className="group-header-control group-hero-back" href={backHref} aria-label="Back to groups"><Icon name="arrow_back" size={23}/></Link></div><div className="group-hero-copy"><h1>{group.name}</h1>{group.description&&<p>{group.description}</p>}<GroupActions slug={slug} name={group.name} initialFavorite={!!favorite} manager={manager} invitationRole={invitation?.role}><GroupShareButton slug={slug} name={group.name} pill/>{manager&&<GroupSettings slug={slug} name={group.name} photo={group.photo} description={group.description??""} visibility={group.visibility as "public"|"unlisted"|"private"} people={dashboard?.people??[]} classes={setupClasses} pill/>}</GroupActions></div></header><GroupHub slug={slug} canPost={!!membership||group.ownerUserId===viewerId} updates={updates} schedule={schedule} members={members} initialTab={initialTab}/></main></div></div>;
}
