import { and, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { avatarColor } from "@/lib/avatar";
import { clockParts, fmtDayHeaderRel, todayIso } from "@/lib/format";
import { AppChrome } from "@/components/AppChrome";
import { PublicTopBar } from "@/components/PublicTopBar";
import { GroupActions } from "@/components/GroupActions";
import { GroupAddClass, GroupMembers, GroupSettings } from "@/components/GroupSetup";
import { Icon } from "@/components/Icon";
import { ProfilePhotoZoom } from "@/components/ProfilePhotoZoom";
import { ProfileInfoAction } from "@/components/ProfileInfoAction";
import { CalendarList, type WeekDayRows } from "@/components/WeekView";
import { ClassOpener } from "@/components/ClassOpener";
import { type GroupPurpose } from "@/app/actions/groups";
import { groupInvitePeople } from "@/app/actions/you";
import { GroupHub, type GroupUpdate } from "@/components/GroupUpdates";
import { GroupOverflow } from "@/components/GroupOverflow";
import { hiddenFrom } from "@/lib/blocks";
import { viewerLook } from "@/lib/look";
import { BackLink } from "@/components/BackLink";

export const dynamic = "force-dynamic";

export default async function GroupPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams:Promise<{tab?:string;from?:string}> }) {
  const { slug } = await params;
  const { tab, from } = await searchParams;
  const db = await getDb();
  const [group] = await db.select().from(schema.groups).where(eq(schema.groups.slug, slug));
  if (!group) notFound();
  const viewerId = await getSessionUserId();
  const hiddenAuthors = await hiddenFrom(viewerId);
  if (viewerId && group.ownerUserId !== viewerId && hiddenAuthors.has(group.ownerUserId)) notFound();
  const [[membership], [invitationRow]] = viewerId ? await Promise.all([
    db.select().from(schema.groupMembers).where(and(eq(schema.groupMembers.groupId, group.id), eq(schema.groupMembers.userId, viewerId))),
    db.select({ id: schema.groupInvitations.id, role: schema.groupInvitations.role, invitedByUserId: schema.groupInvitations.invitedByUserId }).from(schema.groupInvitations).where(and(eq(schema.groupInvitations.groupId, group.id), eq(schema.groupInvitations.inviteeUserId, viewerId))),
  ]) : [[], []];
  const invitation = invitationRow && !hiddenAuthors.has(invitationRow.invitedByUserId) ? invitationRow : undefined;
  if (invitationRow && !invitation) await db.delete(schema.groupInvitations).where(eq(schema.groupInvitations.id, invitationRow.id));
  if (group.visibility === "private" && !membership && !invitation) notFound();
  const manager = group.ownerUserId === viewerId || membership?.role === "owner" || membership?.role === "admin";
  const [invitePeople, favoriteRows, memberRows, selections, postRows] = await Promise.all([
    manager ? groupInvitePeople() : Promise.resolve([]),
    viewerId ? db.select({ id: schema.groupFavorites.id }).from(schema.groupFavorites).where(and(eq(schema.groupFavorites.groupId, group.id), eq(schema.groupFavorites.userId, viewerId))) : Promise.resolve([]),
    db.select({
      id: schema.users.id,
      name: schema.users.name,
      photo: sql<string | null>`coalesce(${schema.users.photoThumb}, ${schema.users.photo})`.as("photo"),
      avatarColor: schema.users.avatarColor,
      role: schema.groupMembers.role,
    }).from(schema.groupMembers).innerJoin(schema.users, eq(schema.groupMembers.userId, schema.users.id)).where(eq(schema.groupMembers.groupId, group.id)),
    db.select().from(schema.groupClasses).where(eq(schema.groupClasses.groupId, group.id)),
    db.select().from(schema.groupPosts).where(eq(schema.groupPosts.groupId, group.id)).orderBy(desc(schema.groupPosts.createdAt)).limit(50),
  ]);
  const [favorite] = favoriteRows;
  const visiblePostRows = postRows.filter((post) => !hiddenAuthors.has(post.authorUserId));
  const { image: _classImage, ...classColumns } = getTableColumns(schema.classes);
  const selectedClassRows = selections.length ? await db.select(classColumns).from(schema.classes).where(inArray(schema.classes.id, selections.map((item) => item.classId))) : [];
  const classRows = selectedClassRows.filter((item) =>
    !hiddenAuthors.has(item.userId) && (!item.coachUserId || !hiddenAuthors.has(item.coachUserId))
  );
  const classById = new Map(classRows.map((item) => [item.id, item]));
  const coachIds = [...new Set(classRows.map((item) => item.userId))];
  const coaches = coachIds.length ? await db.select({
    id: schema.users.id,
    email: schema.users.email,
    name: schema.users.name,
    handle: schema.users.handle,
    photo: sql<string | null>`coalesce(${schema.users.photoThumb}, ${schema.users.photo})`.as("photo"),
    avatarColor: schema.users.avatarColor,
  }).from(schema.users).where(inArray(schema.users.id, coachIds)) : [];
  const coachById = new Map(coaches.map((item) => [item.id, item]));
  const studioIds = [...new Set(classRows.map((item) => item.studioId).filter((id): id is string => !!id))];
  const studios = studioIds.length ? await db.select({ id: schema.studios.id, slug: schema.studios.slug, name: schema.studios.name }).from(schema.studios).where(inArray(schema.studios.id, studioIds)) : [];
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
  const postIds = visiblePostRows.map((post) => post.id);
  const updateClassIds = [...new Set(visiblePostRows.map((post) => post.classId).filter((id): id is string => !!id))];
  const [allCommentRows,reactionRows,savedRows] = await Promise.all([
    postIds.length ? db.select().from(schema.groupPostComments).where(inArray(schema.groupPostComments.postId,postIds)) : [],
    postIds.length ? db.select().from(schema.groupPostReactions).where(inArray(schema.groupPostReactions.postId,postIds)) : [],
    viewerId && updateClassIds.length ? db.select({classId:schema.attendances.classId,iso:schema.attendances.occurrenceDate}).from(schema.attendances).where(and(eq(schema.attendances.userId,viewerId), inArray(schema.attendances.classId, updateClassIds))) : [],
  ]);
  const commentRows = allCommentRows.filter((comment) => !hiddenAuthors.has(comment.authorUserId));
  const updateAuthorIds=[...new Set([...visiblePostRows.map((row)=>row.authorUserId),...commentRows.map((row)=>row.authorUserId)])];
  const updateAuthors=updateAuthorIds.length ? await db.select({
    id: schema.users.id,
    name: schema.users.name,
    photo: sql<string | null>`coalesce(${schema.users.photoThumb}, ${schema.users.photo})`.as("photo"),
    avatarColor: schema.users.avatarColor,
  }).from(schema.users).where(inArray(schema.users.id,updateAuthorIds)) : [];
  const updateAuthorById=new Map(updateAuthors.map((person)=>[person.id,person]));
  const savedSet=new Set(savedRows.map((row)=>`${row.classId}|${row.iso}`));
  const updates:GroupUpdate[]=visiblePostRows.flatMap((post)=>{
    const author=updateAuthorById.get(post.authorUserId); if(!author) return [];
    const cls=post.classId ? classById.get(post.classId) : null; const studio=cls?.studioId ? studioById.get(cls.studioId) : null;
    const time=cls ? clockParts(cls.startTime) : null;
    const reactionKinds=["heart","strong","in"].map((reaction)=>({reaction,count:reactionRows.filter((row)=>row.postId===post.id&&row.reaction===reaction).length,mine:reactionRows.some((row)=>row.postId===post.id&&row.reaction===reaction&&row.userId===viewerId)}));
    return [{ id:post.id,kind:post.kind,body:post.body,createdAt:post.createdAt.toISOString(),author:{id:author.id,name:author.name,photo:author.photo,color:avatarColor(author)},cls:cls&&post.occurrenceDate&&time?{id:cls.id,iso:post.occurrenceDate,name:cls.name,detail:`${new Date(`${post.occurrenceDate}T00:00:00Z`).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",timeZone:"UTC"})} · ${time.hm} ${time.ap}`,where:studio?.name??cls.location??"Location to come",saved:savedSet.has(`${cls.id}|${post.occurrenceDate}`)}:null,comments:commentRows.filter((row)=>row.postId===post.id).flatMap((row)=>{const person=updateAuthorById.get(row.authorUserId);return person?[{id:row.id,body:row.body,author:{id:person.id,name:person.name,photo:person.photo,color:avatarColor(person)}}]:[]}),reactions:reactionKinds }];
  });
  const settingsMembers = memberRows.filter((member) => !hiddenAuthors.has(member.id)).map((member) => ({ id:member.id, name:member.name, photo:member.photo, color:avatarColor(member), role:member.role }));
  const schedule = <section className="group-section group-schedule-section">{manager && <div className="group-section-head group-section-actions"><GroupAddClass slug={slug} /></div>}{days.length ? <ClassOpener handle=""><CalendarList days={days} className="profile-calendar-list" /></ClassOpener> : <div className="empty-block group-schedule-empty"><h2>Nothing planned yet</h2><p>{emptyCopy[purpose]}</p></div>}</section>;
  const members = <GroupMembers slug={slug} inviteToken={manager?group.inviteToken:null} members={settingsMembers} people={invitePeople} canManage={manager} viewerId={viewerId} viewerRole={membership?.role ?? (group.ownerUserId===viewerId?"owner":null)}/>;
  const initialTab = tab === "updates" ? "updates" : tab === "members" ? "members" : "schedule";
  const backHref=from==="calendar-following"?"/calendar/following":from==="discover-groups"?"/discover?half=groups":"/calendar";
  return <div className="pub group-page hasnav" data-mode={await viewerLook()}><div className="profwrap">{viewerId ? <AppChrome userId={viewerId} social /> : <PublicTopBar next={`/g/${slug}`} />}<main className="group-main"><header className="group-hero"><div className="group-seam-top"><BackLink className="group-header-control group-hero-back" href={backHref} anywhere notUnder={`/g/${slug}`} label="Back"><Icon name="arrow_back" size={23}/></BackLink><h1 className="group-seam-name">{group.name}</h1>{viewerId&&<GroupOverflow id={group.id} slug={slug} name={group.name} canReport={viewerId!==group.ownerUserId}/>}</div><ProfilePhotoZoom photo={group.photo} name={group.name} color={avatarColor({id:group.id})} className="group-profile-photo"/><div className="group-hero-copy"><h1 className="group-copy-name">{group.name}</h1><GroupActions slug={slug} name={group.name} initialFavorite={!!favorite} manager={manager} joined={!!membership||group.ownerUserId===viewerId} joinable={group.visibility!=="private"} invitationRole={invitation?.role}><ProfileInfoAction><p>{group.description||"No description has been added yet."}</p></ProfileInfoAction>{manager&&<GroupSettings slug={slug} name={group.name} photo={group.photo} description={group.description??""} visibility={group.visibility as "public"|"unlisted"|"private"} people={invitePeople} pill/>}</GroupActions></div></header><GroupHub slug={slug} canPost={!!membership||group.ownerUserId===viewerId} viewerId={viewerId} updates={updates} schedule={schedule} members={members} initialTab={initialTab}/></main></div></div>;
}
