"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { checkGroupHandle, createGroup, respondToGroupInvitation, type GroupPurpose } from "@/app/actions/groups";
import { Icon } from "@/components/Icon";
import type { YouFavoriteGroup, YouFavoritePerson, YouFavoritePlace, YouGroupInvitation } from "@/components/YouDashboard";

export function SavedScreen({ people, places, yourGroups, favoriteGroups, invitations }: { people: YouFavoritePerson[]; places: YouFavoritePlace[]; yourGroups: YouFavoriteGroup[]; favoriteGroups: YouFavoriteGroup[]; invitations: YouGroupInvitation[] }) {
  const [groupOpen, setGroupOpen] = useState(false);
  const [tab, setTab] = useState<"groups" | "favorites">("groups");
  return <main className="savedpage">
    <header className="savedhead"><h1>Favorites</h1><div className="saved-tabs" role="tablist"><button type="button" role="tab" aria-selected={tab === "groups"} className={tab === "groups" ? "on" : ""} onClick={() => setTab("groups")}>Groups</button><button type="button" role="tab" aria-selected={tab === "favorites"} className={tab === "favorites" ? "on" : ""} onClick={() => setTab("favorites")}>People &amp; studios</button></div></header>
    {tab === "groups" ? <div className="saved-groups-view">
      {invitations.length > 0 && <section className="saved-block"><h2>Invitations</h2><div className="saved-invitations">{invitations.map((invite) => <GroupInvitationCard invite={invite} key={invite.id} />)}</div></section>}
      <section className="saved-block"><div className="saved-block-head saved-groups-head"><h2>Your groups</h2><button type="button" className="saved-group-add-button" aria-label="Create group" onClick={() => setGroupOpen(true)}><Icon name="add" size={24} /></button></div><div className="saved-group-grid">{yourGroups.map((group) => <GroupCard group={group} key={group.id} />)}</div>{yourGroups.length === 0 && <div className="saved-group-empty"><h3>Plan classes together</h3><p>Create a group, add classes from the catalog, and invite your people.</p></div>}</section>
      {favoriteGroups.length > 0 && <section className="saved-block"><div className="saved-block-head"><div><h2>Favorite groups</h2><p>Public groups you saved without joining.</p></div></div><div className="saved-group-grid">{favoriteGroups.map((group) => <GroupCard group={group} key={group.id} />)}</div></section>}
    </div> : <div className="saved-favorites-view"><FavoriteList title="People" empty="Favorite people to keep their individual calendars close by." addHref="/discover">{people.map((person) => <Link className="saved-favorite-row person" href={`/${person.handle}`} key={person.id}>{person.photo ? <img src={person.photo} alt="" /> : <span style={{ background: person.color }}>{person.name.charAt(0).toUpperCase()}</span>}<div><strong>{person.name}</strong><small>{person.title || "View calendar"}</small></div><Icon name="chevron_right" size={18} /></Link>)}</FavoriteList><FavoriteList title="Studios" empty="Favorite studios to return to their schedules quickly." addHref="/discover?half=places">{places.map((place) => <Link className="saved-favorite-row place" href={`/s/${place.slug}`} key={place.id}>{place.photo ? <img src={place.photo} alt="" /> : <span>{place.name.charAt(0).toUpperCase()}</span>}<div><strong>{place.name}</strong><small>{place.types.slice(0, 2).join(" · ") || "View schedule"}</small></div><Icon name="chevron_right" size={18} /></Link>)}</FavoriteList></div>}
    {groupOpen && <CreateGroupSheet onClose={() => setGroupOpen(false)} />}
  </main>;
}

function GroupCard({ group }: { group: YouFavoriteGroup }) {
  const nextDate = group.nextDate ? new Date(`${group.nextDate}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : null;
  return <Link className="saved-group-large" href={`/g/${group.slug}`}><div className="saved-group-card-top"><span className="saved-group-icon"><Icon name="groups" size={25} /></span>{group.role && <span className="saved-group-role">{group.role === "owner" ? "Owner" : group.role === "admin" ? "Admin" : "Member"}</span>}</div><h3>{group.name}</h3>{group.nextClass ? <p><strong>{nextDate}</strong> · {group.nextClass}</p> : <p>No classes planned yet</p>}<div className="saved-group-card-bottom"><div className="saved-group-faces">{group.faces.map((face) => face.photo ? <img src={face.photo} alt="" key={face.id} /> : <span style={{ background: face.color }} key={face.id}>{face.name.charAt(0).toUpperCase()}</span>)}</div><small>{group.memberCount} {group.memberCount === 1 ? "member" : "members"}</small><Icon name="chevron_right" size={17} /></div></Link>;
}

function GroupInvitationCard({ invite }: { invite: YouGroupInvitation }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [pending, start] = useTransition();
  if (hidden) return null;
  const respond = (accept: boolean) => start(async () => { const result = await respondToGroupInvitation(invite.slug, accept); if (result.ok) { setHidden(true); router.refresh(); } });
  return <article className="saved-invitation"><span><Icon name="groups" size={25} /></span><div><strong>{invite.name}</strong><small>{invite.inviterName} invited you as {invite.role === "admin" ? "an admin" : "a member"}.</small></div><div><button type="button" disabled={pending} onClick={() => respond(false)}>Decline</button><button type="button" disabled={pending} onClick={() => respond(true)}>{pending ? "Joining…" : "Join"}</button></div></article>;
}

function FavoriteList({ title, empty, addHref, children }: { title: string; empty: string; addHref: string; children: ReactNode }) {
  const count = Array.isArray(children) ? children.length : children ? 1 : 0;
  return <section className="saved-list"><div className="saved-block-head"><div><h2>{title}</h2></div><Link href={addHref}><Icon name="add" size={20} />Add</Link></div>{count ? <div>{children}</div> : <p className="saved-list-empty">{empty}</p>}</section>;
}

function CreateGroupSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState("");
  const [purpose, setPurpose] = useState<GroupPurpose>("plan");
  const [visibility, setVisibility] = useState<"public" | "unlisted" | "private">("unlisted");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const cleanSlug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42);
  const validateHandle = async () => {
    const result = await checkGroupHandle(slug);
    setSlug(result.slug);
    setSlugStatus(result.ok ? "This link is available." : result.error);
    return result.ok;
  };
  const next = () => start(async () => {
    setError("");
    if (step === 0 && !await validateHandle()) return;
    setStep((current) => current + 1);
  });
  const submit = () => start(async () => {
    setError("");
    try {
      const result = await createGroup({ name, slug, purpose, visibility });
      if (!result.ok) { setError(result.error); return; }
      router.push(`/g/${result.slug}`);
    } catch {
      setError("We couldn’t create the group. Your choices are still here, so please try again.");
    }
  });
  return <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}>
    <div className="sheet create-group-sheet">
      <button type="button" className="iconbtn sheetclose" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
      <div className="create-group-progress" aria-label={`Step ${step + 1} of 3`}><span>Step {step + 1} of 3</span><div>{[0, 1, 2].map((item) => <i className={item <= step ? "on" : ""} key={item} />)}</div></div>
      {step === 0 && <div className="create-group-step"><h2>Name your group</h2><p>This creates the name and shareable link. You can fill out everything else after the group exists.</p><label className="create-group-name"><span>Group name</span><input autoFocus maxLength={60} value={name} onChange={(event) => { const value = event.target.value; setName(value); if (!slugEdited) setSlug(cleanSlug(value)); }} placeholder="Saturday run crew" /></label><label className="create-group-name group-handle"><span>Group link</span><div><span>fittlist.co/g/</span><input maxLength={42} value={slug} onChange={(event) => { setSlugEdited(true); setSlug(cleanSlug(event.target.value)); setSlugStatus(""); }} onBlur={validateHandle} placeholder="saturday-run-crew" /></div></label>{slugStatus && <p className={`group-handle-status${slugStatus.includes("available") ? " ok" : ""}`}>{slugStatus}</p>}</div>}
      {step === 1 && <div className="create-group-step"><h2>What is this group for?</h2><p>This helps us make the first empty state useful. You can still use every group feature.</p><div className="create-group-purpose">{([['plan','Plan classes together','Make it easy to say “I’m going. Join me.”','event_available'],['community','Share a community calendar','Keep members and teachers informed in one place.','groups'],['event','Organize an event','Build a one-off schedule such as an expo or meetup.','calendar_month']] as const).map(([value,title,detail,icon]) => <button type="button" className={purpose === value ? "on" : ""} onClick={() => setPurpose(value)} key={value}><Icon name={icon} size={24} /><span><strong>{title}</strong><small>{detail}</small></span><Icon name={purpose === value ? "check_circle" : "chevron_right"} size={20} /></button>)}</div></div>}
      {step === 2 && <div className="create-group-step"><h2>Who can see it?</h2><p>You can change this later.</p><div className="create-group-visibility">{([['unlisted','Anyone with the link','Share it before making it discoverable.'],['public','Public and discoverable','Anyone can find and favorite it.'],['private','Private','Only members and invited people can open it.']] as const).map(([value,title,detail]) => <button type="button" className={visibility === value ? "on" : ""} onClick={() => setVisibility(value)} key={value}><Icon name={visibility === value ? "check_circle" : "add_circle"} size={22} /><span><strong>{title}</strong><small>{detail}</small></span></button>)}</div></div>}
      <div className="create-group-actions">{error && <p className="formerror" role="alert">{error}</p>}<div>{step > 0 && <button type="button" className="btn ghost" disabled={pending} onClick={() => setStep((current) => current - 1)}>Back</button>}<button type="button" className="btn create-group-submit" disabled={pending || step === 0 && (name.trim().length < 2 || slug.length < 3)} onClick={step === 2 ? submit : next}>{pending ? step === 2 ? "Creating group…" : "Checking link…" : step === 2 ? "Create group" : "Continue"}</button></div></div>
    </div>
  </div>;
}
