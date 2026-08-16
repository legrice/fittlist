import { and, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { avatarColor } from "@/lib/avatar";
import { AppHeader } from "@/components/AppHeader";
import { GroupJoinButton } from "@/components/GroupJoinButton";
import { GroupShareButton } from "@/components/GroupShareButton";
import { GroupManageButton } from "@/components/GroupManageButton";
import { Icon } from "@/components/Icon";
import { GroupSharingControl } from "@/components/GroupSharingControl";
import { shareWeek } from "@/lib/shareweek";
import { DAYS, fmtTime, runsOn, todayIso } from "@/lib/format";
import { rangeDates } from "@/lib/shareweek";
import { GlobalAdd } from "@/components/GlobalAdd";

export const dynamic = "force-dynamic";

export default async function GroupPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ invite?: string }> }) {
  const { slug } = await params;
  const { invite = "" } = await searchParams;
  const db = await getDb();
  const [group] = await db.select().from(schema.groups).where(eq(schema.groups.slug, slug));
  if (!group) notFound();
  const viewerId = await getSessionUserId();
  const members = await db
    .select({ id: schema.users.id, name: schema.users.name, handle: schema.users.handle, title: schema.users.title, location: schema.users.location, photo: schema.users.photoThumb, fullPhoto: schema.users.photo, avatarColor: schema.users.avatarColor, role: schema.groupMembers.role, shareMode: schema.groupMembers.shareMode })
    .from(schema.groupMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.groupMembers.userId))
    .where(eq(schema.groupMembers.groupId, group.id));
  const joined = !!viewerId && members.some((member) => member.id === viewerId);
  const invited = group.visibility === "private" && invite === group.inviteToken;
  const canSeeGroup = group.visibility !== "private" || joined || invited;
  const viewerMembership = viewerId ? members.find((member) => member.id === viewerId) : null;
  const selectedShares = canSeeGroup
    ? await db.select().from(schema.groupClassShares).where(eq(schema.groupClassShares.groupId, group.id))
    : [];
  const selectedSeries = [...new Set(selectedShares.map((share) => share.seriesId))];
  const selectedRows = selectedSeries.length
    ? await db.select().from(schema.classes).where(inArray(schema.classes.seriesId, selectedSeries))
    : [];
  const sharedMembers = canSeeGroup ? members.filter((member) => member.shareMode === "public-week") : [];
  const sharedWeeks = await Promise.all(sharedMembers.map(async (member) => ({ member, days: await shareWeek(member.id, todayIso(), 7) })));
  const combined = new Map<string, { day: string; items: { key: string; time: string; startTime: string; name: string; where: string; member: typeof members[number] }[] }>();
  for (const { member, days } of sharedWeeks) for (const day of days) {
    const current = combined.get(day.iso) ?? { day: day.day, items: [] };
    current.items.push(...day.items.map((item) => ({ key: `${member.id}.${item.key}`, time: item.time, startTime: item.startTime, name: item.name, where: item.where, member })));
    combined.set(day.iso, current);
  }
  // Selected classes can be group-only, so read them directly instead of
  // routing through shareWeek (which correctly hides private classes from a
  // public profile). The group membership is the audience permission here.
  const memberById = new Map(members.map((member) => [member.id, member]));
  const studioIds = [...new Set(selectedRows.map((row) => row.studioId).filter((id): id is string => !!id))];
  const studios = studioIds.length ? await db.select({ id: schema.studios.id, name: schema.studios.name }).from(schema.studios).where(inArray(schema.studios.id, studioIds)) : [];
  const studioName = new Map(studios.map((studio) => [studio.id, studio.name]));
  for (const iso of rangeDates(todayIso(), 7)) {
    const dow = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
    for (const row of selectedRows) {
      if (!runsOn(row, iso, dow)) continue;
      const member = memberById.get(row.userId);
      if (!member) continue;
      const current = combined.get(iso) ?? { day: `${DAYS[dow]} ${new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`, items: [] };
      const key = `${member.id}.${row.id}.${iso}`;
      if (!current.items.some((item) => item.key === key)) {
        current.items.push({ key, time: fmtTime(row.startTime), startTime: row.startTime, name: row.name, where: (row.studioId && studioName.get(row.studioId)) || row.location || "", member });
      }
      combined.set(iso, current);
    }
  }

  return <section className="screen group-public-screen">
    <div className="pad">
      <AppHeader home={viewerId ? "/calendar" : "/"} />
      <main className="group-public">
        <div className="group-public-head">
          <span className="group-mark group-mark-large"><Icon name="groups" size={32} /></span>
          <div className="group-kicker">{group.visibility === "private" ? "Private group" : "Public group"} · {[group.type, group.location].filter(Boolean).join(" · ") || "FittList group"}</div>
          <h1>{group.name}</h1>
          {group.description && <p>{group.description}</p>}
          <div className="group-actions">
            {(group.visibility !== "private" || joined || invited) && <GroupJoinButton groupId={group.id} initial={joined} signedIn={!!viewerId} inviteToken={invited ? invite : undefined} />}
            {canSeeGroup && <GroupShareButton name={group.name} inviteToken={viewerId === group.ownerUserId && group.visibility === "private" ? group.inviteToken : undefined} />}
            {viewerId === group.ownerUserId && <GroupManageButton group={{ id: group.id, name: group.name, description: group.description, location: group.location, type: group.type, visibility: group.visibility }} />}
            {joined && <GlobalAdd floating defaultGroupId={group.id} groupName={group.name} />}
          </div>
        </div>
        {!canSeeGroup ? <section className="group-private"><h2>This group is private</h2><p>Ask an organizer for an invite link to see its shared week and members.</p></section> : <>
        {joined && viewerMembership && <GroupSharingControl groupId={group.id} initial={viewerMembership.shareMode} />}
        <nav className="group-anchor-nav"><a href="#this-week">This week</a><a href="#members">Members</a><a href="#about">About</a></nav>
        <section id="this-week" className="group-week">
          <h2>This week</h2>
          <p>Plans members chose to share, combined in one view.</p>
          {combined.size ? <div className="group-week-days">{[...combined.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([iso, day]) => <section key={iso}><h3>{day.day}</h3>{day.items.sort((a, b) => a.startTime.localeCompare(b.startTime)).map((item) => <a href={item.member.handle ? `/${item.member.handle}` : "#"} className="group-week-item" key={item.key}><time>{item.time}</time><span><strong>{item.name}</strong><small>{[item.where, item.member.name].filter(Boolean).join(" · ")}</small></span></a>)}</section>)}</div> : <div className="group-week-empty"><strong>Nothing shared yet</strong><p>Everyone’s personal calendar stays private until they choose what belongs here.</p></div>}
        </section>
        <section id="members" className="group-roster">
          <h2>Members</h2>
          <p>Open someone’s profile to see the week they share publicly.</p>
          <div className="group-member-list">
            {members.map((member) => {
              const name = member.name.trim() || "FittList member";
              const face = member.photo ?? member.fullPhoto;
              return member.handle ? <a className="group-member" href={`/${member.handle}`} key={member.id}>
                {face ? <img src={face} alt="" /> : <span style={{ background: avatarColor(member) }}>{name.charAt(0).toUpperCase()}</span>}
                <span><strong>{name}</strong><small>{[member.title, member.location].filter(Boolean).join(" · ") || "View calendar"}</small></span>
                {member.role === "owner" && <em>Organizer</em>}
                <Icon name="chevron_right" size={21} />
              </a> : null;
            })}
          </div>
        </section>
        <section id="about" className="group-about"><h2>About</h2><p>{group.description || `${group.name} is a place for members to coordinate their fitness without maintaining another calendar.`}</p></section>
        </>}
      </main>
    </div>
  </section>;
}
