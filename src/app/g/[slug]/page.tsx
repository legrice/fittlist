import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { avatarColor } from "@/lib/avatar";
import { AppHeader } from "@/components/AppHeader";
import { GroupJoinButton } from "@/components/GroupJoinButton";
import { GroupShareButton } from "@/components/GroupShareButton";
import { GroupManageButton } from "@/components/GroupManageButton";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function GroupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await getDb();
  const [group] = await db.select().from(schema.groups).where(eq(schema.groups.slug, slug));
  if (!group) notFound();
  const viewerId = await getSessionUserId();
  const members = await db
    .select({ id: schema.users.id, name: schema.users.name, handle: schema.users.handle, title: schema.users.title, location: schema.users.location, photo: schema.users.photoThumb, fullPhoto: schema.users.photo, avatarColor: schema.users.avatarColor, role: schema.groupMembers.role })
    .from(schema.groupMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.groupMembers.userId))
    .where(eq(schema.groupMembers.groupId, group.id));
  const joined = !!viewerId && members.some((member) => member.id === viewerId);

  return <section className="screen group-public-screen">
    <div className="pad">
      <AppHeader home={viewerId ? "/calendar" : "/"} />
      <main className="group-public">
        <div className="group-public-head">
          <span className="group-mark group-mark-large"><Icon name="groups" size={32} /></span>
          <div className="group-kicker">{[group.type, group.location].filter(Boolean).join(" · ") || "FittList group"}</div>
          <h1>{group.name}</h1>
          {group.description && <p>{group.description}</p>}
          <div className="group-actions">
            <GroupJoinButton groupId={group.id} initial={joined} signedIn={!!viewerId} />
            <GroupShareButton name={group.name} />
            {viewerId === group.ownerUserId && <GroupManageButton group={{ id: group.id, name: group.name, description: group.description, location: group.location, type: group.type }} />}
          </div>
        </div>
        <section className="group-roster">
          <h2>Calendars</h2>
          <p>See what everyone is teaching and doing this week.</p>
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
      </main>
    </div>
  </section>;
}
