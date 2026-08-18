import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { avatarColor } from "@/lib/avatar";
import { clockParts, fmtDayHeaderRel, todayIso } from "@/lib/format";
import { AppChrome } from "@/components/AppChrome";
import { PublicTopBar } from "@/components/PublicTopBar";
import { GroupActions, GroupShareButton } from "@/components/GroupActions";
import { GroupAddClass, GroupSettings } from "@/components/GroupSetup";
import { Icon } from "@/components/Icon";
import { CalendarList, type WeekDayRows } from "@/components/WeekView";
import { ClassOpener } from "@/components/ClassOpener";
import { groupClassOptions, type GroupPurpose } from "@/app/actions/groups";
import { youDashboardData } from "@/app/actions/you";

export const dynamic = "force-dynamic";

export default async function GroupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
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
  const settingsMembers = memberRows.map((member) => ({ id:member.id, name:member.name, photo:member.photo, color:avatarColor(member), role:member.role }));
  return <div className="pub group-page hasnav"><div className="profwrap">{viewerId ? <AppChrome userId={viewerId} /> : <PublicTopBar next={`/g/${slug}`} />}<main className="group-main"><header className="group-hero"><div className="group-page-controls"><Link className="group-header-control" href="/saved" aria-label="Back to groups"><Icon name="arrow_back" size={23} /></Link><div className="group-page-actions"><GroupShareButton slug={slug} name={group.name} />{manager && <GroupSettings slug={slug} name={group.name} description={group.description ?? ""} visibility={group.visibility as "public" | "unlisted" | "private"} people={dashboard?.people ?? []} members={settingsMembers} classes={setupClasses} />}</div></div><h1>{group.name}</h1>{group.description && <p>{group.description}</p>}<GroupActions slug={slug} name={group.name} initialFavorite={!!favorite} manager={manager} invitationRole={invitation?.role} /></header><section className="group-section group-schedule-section"><div className="group-section-head"><h2>Schedule</h2>{manager && days.length > 0 && <GroupAddClass slug={slug} classes={setupClasses} />}</div>{days.length ? <ClassOpener handle=""><CalendarList days={days} /></ClassOpener> : <div className="empty-block group-schedule-empty"><h2>Nothing planned yet</h2><p>{emptyCopy[purpose]}</p>{manager && <GroupAddClass slug={slug} classes={setupClasses} />}</div>}</section>{!manager && <section className="group-section"><h2>People</h2><div className="group-people">{memberRows.map((member) => <div className="group-person" key={member.id}>{member.photo ? <img src={member.photo} alt="" /> : <span style={{ background: avatarColor(member) }}>{member.name.charAt(0).toUpperCase()}</span>}<strong>{member.name}</strong>{member.role === "owner" ? <small>Owner</small> : member.role === "admin" ? <small>Admin</small> : <small>Member</small>}</div>)}</div></section>}</main></div></div>;
}
