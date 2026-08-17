"use client";

import Link from "next/link";
import { Children, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createGroup } from "@/app/actions/groups";
import { Icon } from "@/components/Icon";
import type { YouFavoriteGroup, YouFavoritePerson, YouFavoritePlace } from "@/components/YouDashboard";

export function SavedScreen({ people, places, groups }: { people: YouFavoritePerson[]; places: YouFavoritePlace[]; groups: YouFavoriteGroup[] }) {
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
      {groups.map((group) => <div className="youfav saved-group-card" key={group.id}><span><Icon name="groups" size={30} /></span><strong>{group.name}</strong><small>{group.memberCount} {group.memberCount === 1 ? "person" : "people"}</small></div>)}
    </SavedRail>
    {groupOpen && <CreateGroupSheet people={people} onClose={() => setGroupOpen(false)} />}
  </main>;
}

function CreateGroupSheet({ people, onClose }: { people: YouFavoritePerson[]; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const submit = () => start(async () => {
    setError("");
    const result = await createGroup({ name, memberIds: selected });
    if (!result.ok) { setError(result.error); return; }
    router.refresh();
    onClose();
  });
  return <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}>
    <div className="sheet create-group-sheet">
      <button type="button" className="iconbtn sheetclose" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
      <h2>Create a group</h2>
      <p className="create-group-intro">Give your crew a name, then add people you already favorite.</p>
      <label className="create-group-name"><span>Group name</span><input autoFocus maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="Saturday run crew" /></label>
      <div className="create-group-people">
        <h3>Add people</h3>
        {people.length ? people.map((person) => <button type="button" className={`create-group-person${selected.includes(person.id) ? " on" : ""}`} onClick={() => toggle(person.id)} key={person.id}>{person.photo ? <img src={person.photo} alt="" /> : <span style={{ background: person.color }}>{person.name.charAt(0).toUpperCase()}</span>}<strong>{person.name}</strong><Icon name={selected.includes(person.id) ? "check" : "add"} size={20} /></button>) : <p>Favorite a coach or friend first, then you can add them here.</p>}
      </div>
      {error && <p className="formerror" role="alert">{error}</p>}
      <button type="button" className="btn create-group-submit" disabled={pending || name.trim().length < 2} onClick={submit}>{pending ? "Creating…" : "Create group"}</button>
    </div>
  </div>;
}

function SavedRail({ title, empty, addHref, onAdd, kind, children }: { title: string; empty: string; addHref?: string; onAdd?: () => void; kind: "people" | "places" | "groups"; children?: ReactNode }) {
  const hasItems = Children.count(children) > 0;
  const addContents = <><span><Icon name="add" size={28} /></span><strong>{hasItems ? "Add more" : "Add"}</strong></>;
  return <section className={`yousection savedsection savedsection-${kind}`}><div className="yousection-head"><h2>{title}</h2></div><div className="youfavrail">{children}{onAdd ? <button type="button" className="youfav youfav-add" onClick={onAdd}>{addContents}</button> : <Link className="youfav youfav-add" href={addHref!}>{addContents}</Link>}</div>{!hasItems && <p className="youemptycopy">{empty}</p>}</section>;
}
