"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { DirPerson, DirStudio } from "@/components/DirectoryRows";
import { FavoritePersonButton } from "@/components/FavoritePersonButton";
import { FavoritePlaceButton } from "@/components/FavoritePlaceButton";
import type { BrowseDay } from "@/app/actions/discover";

export type DiscoverHalf = "people" | "places" | "classes" | "groups";
type AllSheet = DiscoverHalf | null;

export function DiscoverList({
  people,
  studios = [],
  backHref,
  hideBack = false,
  startHalf,
  upcoming = [],
  myLat = null,
  myLng = null,
  groups = [],
}: {
  people: DirPerson[];
  studios?: DirStudio[];
  cities: string[];
  myCity?: string | null;
  myLat?: number | null;
  myLng?: number | null;
  backHref: string;
  hideBack?: boolean;
  startHalf?: DiscoverHalf;
  upcoming?: BrowseDay[];
  groups?: { id: string; name: string; slug: string; description: string | null }[];
}) {
  const [query, setQuery] = useState("");
  const [allSheet, setAllSheet] = useState<AllSheet>(startHalf ?? null);
  const [classType, setClassType] = useState("");
  const [distance, setDistance] = useState("");
  const q = query.trim().toLowerCase();

  const shownPeople = useMemo(() => people.filter((person) => {
    const matchesQuery = !q || [person.name, person.title, person.location, person.handle, ...person.disciplines]
      .some((value) => value.toLowerCase().includes(q));
    return matchesQuery;
  }), [people, q]);

  const shownStudios = useMemo(() => studios.filter((studio) => {
    const matchesQuery = !q || [studio.name, studio.address, ...studio.types]
      .some((value) => value.toLowerCase().includes(q));
    return matchesQuery;
  }), [studios, q]);
  const shownGroups = useMemo(() => groups.filter((group) => !q || `${group.name} ${group.description ?? ""}`.toLowerCase().includes(q)), [groups, q]);

  const allUpcoming = useMemo(() => upcoming
    .flatMap((day) => day.items.map((item) => ({ ...item, day: day.label })))
    .filter((item) => !q || [item.name, item.where, item.attributionName]
      .some((value) => (value ?? "").toLowerCase().includes(q))), [upcoming, q]);
  const classTypes = useMemo(() => [...new Set(allUpcoming.map((item) => item.classType).filter((value): value is string => !!value))].sort(), [allUpcoming]);
  const filteredUpcoming = useMemo(() => allUpcoming.filter((item) => {
    if (classType && item.classType !== classType) return false;
    if (distance) {
      if (myLat == null || myLng == null || item.lat == null || item.lng == null) return false;
      if (milesBetween(myLat, myLng, item.lat, item.lng) > Number(distance)) return false;
    }
    return true;
  }), [allUpcoming, classType, distance, myLat, myLng]);

  const activityByName = upcoming.flatMap((day) => day.items).reduce((counts, item) => {
    const key = item.attributionName.trim().toLowerCase();
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const activityFor = (person: DirPerson) => activityByName.get(person.name.trim().toLowerCase()) ?? person.classesThisWeek;
  const activePeople = shownPeople
    .filter((person) => person.kind === "coach")
    .sort((a, b) => activityFor(b) - activityFor(a) || Number(!!b.photo) - Number(!!a.photo));

  const teacherFor = (name: string) => people.find((person) => person.name.trim().toLowerCase() === name.trim().toLowerCase());

  return (
    <>
      <div className="dissearchrow discover-searchrow">
        <label className="dissearch">
          <Icon name="search" size={20} className="dissearch-ic" />
          <input className="dissearch-in" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search classes, coaches, and places" aria-label="Search classes, coaches, and places" />
          {query && <button type="button" className="dissearch-x" onClick={() => setQuery("")} aria-label="Clear search"><Icon name="close" size={19} /></button>}
        </label>
      </div>

      <div className="discover-for-you">
        <DiscoverSection title="Upcoming classes" onSeeAll={() => setAllSheet("classes")}>
          {allUpcoming.length ? <div className="discover-event-rail">{allUpcoming.slice(0, 6).map((item) => <DiscoverEvent item={item} teacher={teacherFor(item.attributionName)} key={`${item.classId}.${item.iso}`} />)}</div> : <p className="discover-section-empty">No upcoming classes match this search.</p>}
        </DiscoverSection>
        <DiscoverSection title="Coaches to explore" onSeeAll={() => setAllSheet("people")}>
          {activePeople.length ? <div className="discover-person-grid">{activePeople.slice(0, 6).map((person, index) => <DiscoverPerson person={person} index={index} activity={activityFor(person)} key={person.id} />)}</div> : <p className="discover-section-empty">No coaches match this search.</p>}
        </DiscoverSection>
        <DiscoverSection title="Places to explore" onSeeAll={() => setAllSheet("places")}>
          {shownStudios.length ? <StudioGrid studios={shownStudios.slice(0, 6)} /> : <p className="discover-section-empty">No places match this search.</p>}
        </DiscoverSection>
        <DiscoverSection title="Groups to explore" onSeeAll={() => setAllSheet("groups")}>
          {shownGroups.length ? <GroupGrid groups={shownGroups.slice(0, 6)} /> : <p className="discover-section-empty">No public groups match this search yet.</p>}
        </DiscoverSection>
      </div>

      {allSheet && <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) setAllSheet(null); }}>
        <div className="sheet discover-all-sheet">
          <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setAllSheet(null)}><Icon name="close" size={18} /></button>
          <h2>{allSheet === "classes" ? "Upcoming classes" : allSheet === "people" ? "Coaches to explore" : allSheet === "groups" ? "Groups to explore" : "Places to explore"}</h2>
          <div className="discover-all-content">
            {allSheet === "classes" && <><div className="discover-class-filters" aria-label="Class filters"><label><span>Type</span><select value={classType} onChange={(event) => setClassType(event.target.value)}><option value="">All types</option>{classTypes.map((value) => <option value={value} key={value}>{value}</option>)}</select></label><label><span>Distance</span><select value={distance} onChange={(event) => setDistance(event.target.value)} disabled={myLat == null || myLng == null}><option value="">Any distance</option><option value="1">Within 1 mile</option><option value="5">Within 5 miles</option><option value="10">Within 10 miles</option><option value="25">Within 25 miles</option></select></label></div>{(myLat == null || myLng == null) && <p className="discover-distance-note">Add your location in your profile to filter by distance.</p>}{filteredUpcoming.length ? <div className="discover-event-list">{filteredUpcoming.map((item) => <DiscoverEvent item={item} teacher={teacherFor(item.attributionName)} key={`${item.classId}.${item.iso}`} />)}</div> : <p className="discover-section-empty">No classes match these filters.</p>}</>}
            {allSheet === "people" && <div className="discover-person-grid">{activePeople.map((person, index) => <DiscoverPerson person={person} index={index} activity={activityFor(person)} key={person.id} />)}</div>}
            {allSheet === "places" && <StudioGrid studios={shownStudios} />}
            {allSheet === "groups" && <GroupGrid groups={shownGroups} />}
          </div>
        </div>
      </div>}

      {!hideBack && <Link className="logoutbtn" href={backHref}>Back to your week</Link>}
    </>
  );
}

function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function DiscoverSection({ title, onSeeAll, children }: { title: string; onSeeAll: () => void; children: ReactNode }) {
  return <section className="discover-section"><div className="discover-section-head"><h2>{title}</h2><button type="button" onClick={onSeeAll}>See all</button></div>{children}</section>;
}

type UpcomingItem = BrowseDay["items"][number] & { day: string };
function DiscoverEvent({ item, teacher }: { item: UpcomingItem; teacher?: DirPerson }) {
  return <Link className="discover-event-card" href={`/${item.base}/${item.classId}?d=${item.iso}&from=discover`}>
    <small>{item.day} • {item.hm}{item.ap.toLowerCase()}</small>
    {item.classType && <span className="discover-event-type">{item.classType}</span>}
    <strong>{item.name}</strong>
    <span className="discover-event-studio">{item.where || "Location to come"}</span>
    <span className="discover-event-teacher"><span className="discover-event-avatar" style={{ background: teacher?.color }}>{teacher?.photo ? <img src={teacher.photo} alt="" /> : (item.attributionName.trim().charAt(0) || "?").toUpperCase()}</span><span>{item.attributionName}</span></span>
  </Link>;
}

function DiscoverPerson({ person, index, activity = person.classesThisWeek }: { person: DirPerson; index: number; activity?: number }) {
  return <div className="discover-person-tile"><Link href={`/${person.handle}?from=discover`} className="discover-person-main"><span className="discover-person-face" style={{ background: person.color }}>{person.photo ? <img src={person.photo} alt="" loading={index < 4 ? "eager" : "lazy"} /> : (person.name.trim().charAt(0) || "?").toUpperCase()}</span><span className="discover-person-copy"><strong>{person.name}</strong><small className="discover-person-location">{[activity ? `${activity} this week` : person.title || person.disciplines.slice(0, 2).join(" · "), person.location].filter(Boolean).join(" · ")}</small></span></Link><FavoritePersonButton person={person} /></div>;
}

function StudioGrid({ studios }: { studios: DirStudio[] }) {
  return <div className="discover-studio-grid">{studios.map((studio, index) => <div className="discover-studio-tile" key={studio.id}><Link href={`/s/${studio.slug}?from=discover`}><span className="discover-studio-media">{studio.photo ? <img src={studio.photo} alt="" loading={index < 4 ? "eager" : "lazy"} /> : <span className="discover-studio-placeholder" style={{ background: studio.color }}>{(studio.name.trim().charAt(0) || "?").toUpperCase()}</span>}</span><strong>{studio.name}</strong><small>{studio.types.slice(0, 2).join(" · ") || "Fitness space"}</small></Link><FavoritePlaceButton studio={studio} /></div>)}</div>;
}

function GroupGrid({ groups }: { groups: { id: string; name: string; slug: string; description: string | null }[] }) {
  return <div className="discover-group-grid">{groups.map((group) => <Link className="discover-group-tile" href={`/g/${group.slug}?from=discover`} key={group.id}><span><Icon name="groups" size={28} /></span><strong>{group.name}</strong><small>{group.description || "Open group"}</small></Link>)}</div>;
}
