"use client";

import Link from "next/link";
import { Children, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createGroup } from "@/app/actions/groups";
import type { GroupClassChoice } from "@/app/actions/groups";
import { Icon } from "@/components/Icon";
import type { YouFavoriteGroup, YouFavoritePerson, YouFavoritePlace } from "@/components/YouDashboard";

export function SavedScreen({ people, places, groups, classes }: { people: YouFavoritePerson[]; places: YouFavoritePlace[]; groups: YouFavoriteGroup[]; classes: GroupClassChoice[] }) {
  const [groupOpen, setGroupOpen] = useState(false);
  return <main className="savedpage">
    <header className="savedhead"><h1>Your favorites</h1></header>
    <SavedRail kind="people" title="People" empty="Save the people whose calendars you want close by. Each calendar stays separate." addHref="/discover">
      {people.map((person) => <Link className="youfav" href={`/${person.handle}`} key={person.id}>{person.photo ? <img src={person.photo} alt="" /> : <span style={{ background: person.color }}>{person.name.charAt(0).toUpperCase()}</span>}<strong>{person.name}</strong>{person.title && <small>{person.title}</small>}</Link>)}
    </SavedRail>
    <SavedRail kind="places" title="Places" empty="Save studios and spaces to find their schedules again quickly." addHref="/discover?half=places">
      {places.map((place) => <Link className="youfav" href={`/s/${place.slug}`} key={place.id}>{place.photo ? <img src={place.photo} alt="" /> : <span>{place.name.charAt(0).toUpperCase()}</span>}<strong>{place.name}</strong>{place.types.length > 0 && <small>{place.types.slice(0, 2).join(" · ")}</small>}</Link>)}
    </SavedRail>
    <SavedRail kind="groups" title="Groups" empty="Make a group for the people you plan and train with." onAdd={() => setGroupOpen(true)}>
      {groups.map((group) => <Link className="youfav saved-group-card" href={`/g/${group.slug}`} key={group.id}><span><Icon name="groups" size={30} /></span><strong>{group.name}</strong><small>{group.memberCount} {group.memberCount === 1 ? "person" : "people"}</small></Link>)}
    </SavedRail>
    {groupOpen && <CreateGroupSheet people={people} classes={classes} onClose={() => setGroupOpen(false)} />}
  </main>;
}

function CreateGroupSheet({ people, classes, onClose }: { people: YouFavoritePerson[]; classes: GroupClassChoice[]; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<"public" | "unlisted" | "private">("unlisted");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const toggleClass = (key: string) => setSelectedClasses((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]);
  const visiblePeople = people.filter((person) => `${person.name} ${person.title}`.toLowerCase().includes(search.trim().toLowerCase()));
  const submit = () => start(async () => {
    setError("");
    try {
      const result = await createGroup({ name, description, visibility, memberIds: selected, classes: classes.filter((item) => selectedClasses.includes(`${item.classId}|${item.iso}`)).map(({ classId, iso }) => ({ classId, iso })) });
      if (!result.ok) { setError(result.error); return; }
      router.push(`/g/${result.slug}`);
    } catch {
      setError("We couldn’t create the group. Your choices are still here, so please try again.");
    }
  });
  return <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}>
    <div className="sheet create-group-sheet">
      <button type="button" className="iconbtn sheetclose" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
      <div className="create-group-progress" aria-label={`Step ${step + 1} of 5`}><span>Step {step + 1} of 5</span><div>{[0, 1, 2, 3, 4].map((item) => <i className={item <= step ? "on" : ""} key={item} />)}</div></div>
      {step === 0 && <div className="create-group-step"><h2>Name your group</h2><p>Choose something your group will recognize.</p><label className="create-group-name"><span>Group name</span><input autoFocus maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="Saturday run crew" /></label></div>}
      {step === 1 && <div className="create-group-step"><h2>Add a description</h2><p>Optional. Say what the group is for.</p><label className="create-group-name"><span>Description</span><textarea autoFocus maxLength={280} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Weekend runs, classes, and coffee after." /></label><small className="create-group-count">{description.length}/280</small></div>}
      {step === 2 && <div className="create-group-step"><h2>Add group members</h2><p>Search people you&rsquo;ve favorited. You can add more members later.</p><label className="create-group-search"><Icon name="search" size={19} /><input autoFocus type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search names" /></label><div className="create-group-people">{visiblePeople.length ? visiblePeople.map((person) => <button type="button" className={`create-group-person${selected.includes(person.id) ? " on" : ""}`} onClick={() => toggle(person.id)} key={person.id}>{person.photo ? <img src={person.photo} alt="" /> : <span style={{ background: person.color }}>{person.name.charAt(0).toUpperCase()}</span>}<span className="create-group-person-copy"><strong>{person.name}</strong>{person.title && <small>{person.title}</small>}</span><Icon name={selected.includes(person.id) ? "check_circle" : "add_circle"} size={22} /></button>) : <p>{people.length ? "No matching people." : "Favorite someone first, then you can add them as a group member here."}</p>}</div></div>}
      {step === 3 && <div className="create-group-step"><h2>Add classes</h2><p>Optional. Pick classes already saved to your calendar.</p><div className="create-group-classes">{classes.length ? classes.map((item) => { const key = `${item.classId}|${item.iso}`; const on = selectedClasses.includes(key); return <button type="button" className={`create-group-class${on ? " on" : ""}`} onClick={() => toggleClass(key)} key={key}><span><strong>{item.name}</strong><small>{item.detail}</small></span><Icon name={on ? "check_circle" : "add_circle"} size={22} /></button>; }) : <p>Save a class to your calendar first, or create the group without one.</p>}</div></div>}
      {step === 4 && <div className="create-group-step"><h2>Who can see it?</h2><p>You can change this later.</p><div className="create-group-visibility">{([['unlisted','Anyone with the link','Share it before making it discoverable.'],['public','Public and discoverable','Anyone can find and favorite it.'],['private','Private','Only members can open the page.']] as const).map(([value,title,detail]) => <button type="button" className={visibility === value ? "on" : ""} onClick={() => setVisibility(value)} key={value}><Icon name={visibility === value ? "check_circle" : "add_circle"} size={22} /><span><strong>{title}</strong><small>{detail}</small></span></button>)}</div></div>}
      {error && <p className="formerror" role="alert">{error}</p>}
      <div className="create-group-actions">{step > 0 && <button type="button" className="btn ghost" disabled={pending} onClick={() => setStep((current) => current - 1)}>Back</button>}<button type="button" className="btn create-group-submit" disabled={pending || step === 0 && name.trim().length < 2} onClick={step === 4 ? submit : () => setStep((current) => current + 1)}>{pending ? "Creating…" : step === 4 ? "Create group" : step === 2 && selected.length === 0 ? "Skip for now" : step === 3 && selectedClasses.length === 0 ? "Skip for now" : "Continue"}</button></div>
    </div>
  </div>;
}

function SavedRail({ title, empty, addHref, onAdd, kind, children }: { title: string; empty: string; addHref?: string; onAdd?: () => void; kind: "people" | "places" | "groups"; children?: ReactNode }) {
  const hasItems = Children.count(children) > 0;
  const addContents = <><span><Icon name="add" size={28} /></span><strong>{hasItems ? "Add more" : "Add"}</strong></>;
  return <section className={`yousection savedsection savedsection-${kind}`}><div className="yousection-head"><h2>{title}</h2></div><div className="youfavrail">{children}{onAdd ? <button type="button" className="youfav youfav-add" onClick={onAdd}>{addContents}</button> : <Link className="youfav youfav-add" href={addHref!}>{addContents}</Link>}</div>{!hasItems && <p className="youemptycopy">{empty}</p>}</section>;
}
