"use client";

import Link from "next/link";
import { Children, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { checkGroupHandle, createGroup, respondToGroupInvitation, type GroupPurpose } from "@/app/actions/groups";
import { Icon } from "@/components/Icon";
import type { YouFavoriteGroup, YouFavoritePerson, YouFavoritePlace, YouGroupInvitation } from "@/components/YouDashboard";

export function SavedScreen({ people, places, yourGroups, favoriteGroups, invitations, highlight=null }: { people: YouFavoritePerson[]; places: YouFavoritePlace[]; yourGroups: YouFavoriteGroup[]; favoriteGroups: YouFavoriteGroup[]; invitations: YouGroupInvitation[]; highlight?:string|null }) {
  const [groupOpen, setGroupOpen] = useState(false);
  const groups = [...yourGroups, ...favoriteGroups];
  const calendarPeople = people
    .map((person, index) => ({ person, index }))
    .sort((a, b) => Number(b.person.handle.toLowerCase()===highlight) - Number(a.person.handle.toLowerCase()===highlight) || Number(b.person.hasCalendar) - Number(a.person.hasCalendar) || Number(!!b.person.photo) - Number(!!a.person.photo) || a.index - b.index)
    .map(({ person }) => person);
  useEffect(() => {
    if (!highlight) return;
    document.querySelector(".youfav-highlight")?.scrollIntoView({ behavior:"smooth", block:"nearest", inline:"center" });
  }, [highlight]);
  return <main className="savedpage">
    <header className="savedhead"><h1>Favorites</h1></header>
    <SavedRail kind="people" title="People" empty="Favorite people to keep their individual calendars close by." addHref="/discover">
      {calendarPeople.map((person) => <Link className={`youfav${person.handle.toLowerCase()===highlight?" youfav-highlight":""}`} href={`/${person.handle}?from=saved`} key={person.id}>{person.photo ? <img src={person.photo} alt="" loading="lazy" decoding="async" /> : <span style={{ background: person.color }}>{person.name.charAt(0).toUpperCase()}</span>}<strong>{person.name}</strong>{person.coaching ? <small className="youfav-coaching">Coach</small> : person.title ? <small>{person.title}</small> : null}</Link>)}
    </SavedRail>
    <SavedRail kind="places" title="Studios" empty="Favorite studios to find their schedules again quickly." addHref="/discover?half=places">
      {places.map((place) => <Link className="youfav" href={`/s/${place.slug}?from=saved`} key={place.id}>{place.photo ? <img src={place.photo} alt="" loading="lazy" decoding="async" /> : <span>{place.name.charAt(0).toUpperCase()}</span>}<strong>{place.name}</strong>{place.types.length > 0 && <small>{place.types.slice(0, 2).join(" · ")}</small>}</Link>)}
    </SavedRail>
    {invitations.length > 0 && <section className="saved-block saved-rail-invitations"><h2>Invitations</h2><div className="saved-invitations">{invitations.map((invite) => <GroupInvitationCard invite={invite} key={invite.id} />)}</div></section>}
    <SavedRail kind="groups" title="Groups" empty="Make a group for the people you plan and train with." onAdd={() => setGroupOpen(true)}>
      {groups.map((group) => <GroupRailCard group={group} key={group.id} />)}
    </SavedRail>
    {groupOpen && <CreateGroupSheet onClose={() => setGroupOpen(false)} />}
  </main>;
}

function GroupRailCard({ group }: { group: YouFavoriteGroup }) {
  const nextDate = group.nextDate ? new Date(`${group.nextDate}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : null;
  return <Link className="youfav saved-group-card" href={`/g/${group.slug}?from=saved`}>{group.photo ? <img src={group.photo} alt="" loading="lazy" decoding="async" /> : <span><Icon name="groups" size={30} /></span>}<strong>{group.name}</strong><small>{group.nextClass ? `${nextDate} · ${group.nextClass}` : `${group.memberCount} ${group.memberCount === 1 ? "member" : "members"}`}</small></Link>;
}

function GroupInvitationCard({ invite }: { invite: YouGroupInvitation }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [pending, start] = useTransition();
  if (hidden) return null;
  const respond = (accept: boolean) => start(async () => { const result = await respondToGroupInvitation(invite.slug, accept); if (result.ok) { setHidden(true); router.refresh(); } });
  return <article className="saved-invitation"><span><Icon name="groups" size={25} /></span><div><strong>{invite.name}</strong><small>{invite.inviterName} invited you as {invite.role === "admin" ? "an admin" : "a member"}.</small></div><div><button type="button" disabled={pending} onClick={() => respond(false)}>Decline</button><button type="button" disabled={pending} onClick={() => respond(true)}>{pending ? "Joining…" : "Join"}</button></div></article>;
}

function SavedRail({ title, empty, addHref, onAdd, kind, children }: { title:string; empty:string; addHref?:string; onAdd?:()=>void; kind:"people"|"places"|"groups"; children?:ReactNode }) {
  const hasItems=Children.count(children)>0;
  const addContents=<><span><Icon name="add" size={28}/></span><strong>{hasItems?"Add more":"Add"}</strong></>;
  return <section className={`yousection savedsection savedsection-${kind}`}><div className="yousection-head"><h2>{title}</h2></div><div className="youfavrail">{children}{onAdd?<button type="button" className="youfav youfav-add" onClick={onAdd}>{addContents}</button>:<Link className="youfav youfav-add" href={addHref!}>{addContents}</Link>}</div>{!hasItems&&<p className="youemptycopy">{empty}</p>}</section>;
}

export function CreateGroupSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState("");
  const [purpose, setPurpose] = useState<GroupPurpose>("plan");
  const [visibility, setVisibility] = useState<"public" | "unlisted" | "private">("unlisted");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => {
    sheetRef.current?.scrollTo({ top: 0 });
  }, [step]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, pending]);
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
  return <div className="sheet-scrim create-group-scrim" onClick={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}>
    <div ref={sheetRef} className="sheet create-group-sheet" role="dialog" aria-modal="true" aria-labelledby="create-group-title">
      <button type="button" className="iconbtn sheetclose" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
      <div className="create-group-progress" aria-label={`Step ${step + 1} of 3`}><span>Step {step + 1} of 3</span><div>{[0, 1, 2].map((item) => <i className={item <= step ? "on" : ""} key={item} />)}</div></div>
      {step === 0 && <div className="create-group-step"><h2 id="create-group-title">Name your group</h2><p>This creates the name and shareable link. You can fill out everything else after the group exists.</p><label className="create-group-name"><span>Group name</span><input maxLength={60} value={name} onChange={(event) => { const value = event.target.value; setName(value); if (!slugEdited) setSlug(cleanSlug(value)); }} placeholder="Saturday run crew" /></label><label className="create-group-name group-handle"><span>Group link</span><div><span>fittlist.co/g/</span><input maxLength={42} value={slug} onChange={(event) => { setSlugEdited(true); setSlug(cleanSlug(event.target.value)); setSlugStatus(""); }} onBlur={validateHandle} placeholder="saturday-run-crew" /></div></label>{slugStatus && <p className={`group-handle-status${slugStatus.includes("available") ? " ok" : ""}`}>{slugStatus}</p>}</div>}
      {step === 1 && <div className="create-group-step"><h2 id="create-group-title">What is this group for?</h2><p>This helps us make the first empty state useful. You can still use every group feature.</p><div className="create-group-purpose">{([['plan','Plan classes together','Make it easy to say “I’m going. Join me.”','event_available'],['community','Share a community calendar','Keep members and teachers informed in one place.','groups'],['event','Organize an event','Build a one-off schedule such as an expo or meetup.','calendar_month']] as const).map(([value,title,detail,icon]) => <button type="button" className={purpose === value ? "on" : ""} onClick={() => setPurpose(value)} key={value}><Icon name={icon} size={24} /><span><strong>{title}</strong><small>{detail}</small></span><Icon name={purpose === value ? "check_circle" : "chevron_right"} size={20} /></button>)}</div></div>}
      {step === 2 && <div className="create-group-step"><h2 id="create-group-title">Who can see it?</h2><p>You can change this later.</p><div className="create-group-visibility">{([['unlisted','Anyone with the link','Share it before making it discoverable.'],['public','Public and discoverable','Anyone can find and favorite it.'],['private','Private','Only members and invited people can open it.']] as const).map(([value,title,detail]) => <button type="button" className={visibility === value ? "on" : ""} onClick={() => setVisibility(value)} key={value}><Icon name={visibility === value ? "check_circle" : "add_circle"} size={22} /><span><strong>{title}</strong><small>{detail}</small></span></button>)}</div></div>}
      <div className="create-group-actions">{error && <p className="formerror" role="alert">{error}</p>}<div>{step > 0 && <button type="button" className="btn ghost" disabled={pending} onClick={() => setStep((current) => current - 1)}>Back</button>}<button type="button" className="btn create-group-submit" disabled={pending || step === 0 && (name.trim().length < 2 || slug.length < 3)} onClick={step === 2 ? submit : next}>{pending ? step === 2 ? "Creating group…" : "Checking link…" : step === 2 ? "Create group" : "Continue"}</button></div></div>
    </div>
  </div>;
}
