"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { DirPerson, DirStudio } from "@/components/DirectoryRows";
import { FavoritePersonButton } from "@/components/FavoritePersonButton";
import { FavoritePlaceButton } from "@/components/FavoritePlaceButton";
import type { BrowseDay } from "@/app/actions/discover";

export type DiscoverHalf = "people" | "places" | "classes";
type AllSheet = DiscoverHalf | null;
const NEAR_ME = "__near_me__";

export function DiscoverList({
  people,
  studios = [],
  myCity = null,
  backHref,
  hideBack = false,
  startHalf,
  upcoming = [],
}: {
  people: DirPerson[];
  studios?: DirStudio[];
  cities: string[];
  myCity?: string | null;
  backHref: string;
  hideBack?: boolean;
  startHalf?: DiscoverHalf;
  upcoming?: BrowseDay[];
}) {
  const [query, setQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState(myCity ? NEAR_ME : "");
  const [areaOpen, setAreaOpen] = useState(false);
  const [allSheet, setAllSheet] = useState<AllSheet>(startHalf ?? null);
  const effectiveCity = selectedCity === NEAR_ME ? (myCity ?? "") : selectedCity;
  const q = query.trim().toLowerCase();

  const shownPeople = useMemo(() => people.filter((person) => {
    const matchesQuery = !q || [person.name, person.title, person.location, person.handle, ...person.disciplines]
      .some((value) => value.toLowerCase().includes(q));
    return matchesQuery && (!effectiveCity || person.location.toLowerCase().includes(effectiveCity.toLowerCase()));
  }), [people, q, effectiveCity]);

  const shownStudios = useMemo(() => studios.filter((studio) => {
    const matchesQuery = !q || [studio.name, studio.address, ...studio.types]
      .some((value) => value.toLowerCase().includes(q));
    return matchesQuery && (!effectiveCity || studio.address.toLowerCase().includes(effectiveCity.toLowerCase()));
  }), [studios, q, effectiveCity]);

  const allUpcoming = useMemo(() => upcoming
    .flatMap((day) => day.items.map((item) => ({ ...item, day: day.label })))
    .filter((item) => !q || [item.name, item.where, item.attributionName]
      .some((value) => (value ?? "").toLowerCase().includes(q))), [upcoming, q]);

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

      <div className="discover-filterrow" aria-label="Discover area">
        <button type="button" className={`discover-filterpill${selectedCity ? " on" : ""}`} onClick={() => setAreaOpen(true)}>
          {selectedCity === NEAR_ME ? `Near ${myCity?.split(",")[0] ?? "me"}` : "Everywhere"}
          <Icon name="expand_more" size={17} />
        </button>
      </div>

      {areaOpen && <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) setAreaOpen(false); }}>
        <div className="sheet discover-filter-sheet">
          <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setAreaOpen(false)}><Icon name="close" size={18} /></button>
          <h2>Distance</h2>
          <div className="discover-filter-options">
            {[{ value: "", label: "Everywhere" }, ...(myCity ? [{ value: NEAR_ME, label: `Near ${myCity.split(",")[0]}` }] : [])].map((option) => (
              <button type="button" className="clsopt" key={option.value} onClick={() => { setSelectedCity(option.value); setAreaOpen(false); }}>
                <span>{option.label}</span>{option.value === selectedCity && <Icon className="clsopt-on" name="check" size={21} />}
              </button>
            ))}
          </div>
        </div>
      </div>}

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
      </div>

      {allSheet && <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) setAllSheet(null); }}>
        <div className="sheet discover-all-sheet">
          <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setAllSheet(null)}><Icon name="close" size={18} /></button>
          <h2>{allSheet === "classes" ? "Upcoming classes" : allSheet === "people" ? "Coaches to explore" : "Places to explore"}</h2>
          <div className="discover-all-content">
            {allSheet === "classes" && <div className="discover-event-list">{allUpcoming.map((item) => <DiscoverEvent item={item} teacher={teacherFor(item.attributionName)} key={`${item.classId}.${item.iso}`} />)}</div>}
            {allSheet === "people" && <div className="discover-person-grid">{activePeople.map((person, index) => <DiscoverPerson person={person} index={index} activity={activityFor(person)} key={person.id} />)}</div>}
            {allSheet === "places" && <StudioGrid studios={shownStudios} />}
          </div>
        </div>
      </div>}

      {!hideBack && <Link className="logoutbtn" href={backHref}>Back to your week</Link>}
    </>
  );
}

function DiscoverSection({ title, onSeeAll, children }: { title: string; onSeeAll: () => void; children: ReactNode }) {
  return <section className="discover-section"><div className="discover-section-head"><h2>{title}</h2><button type="button" onClick={onSeeAll}>See all</button></div>{children}</section>;
}

type UpcomingItem = BrowseDay["items"][number] & { day: string };
function DiscoverEvent({ item, teacher }: { item: UpcomingItem; teacher?: DirPerson }) {
  return <Link className="discover-event-card" href={`/${item.base}/${item.classId}?d=${item.iso}&from=discover`}>
    <small>{item.day} · {item.hm}{item.ap.toLowerCase()}</small>
    <strong>{item.name}</strong>
    <span className="discover-event-teacher"><span className="discover-event-avatar" style={{ background: teacher?.color }}>{teacher?.photo ? <img src={teacher.photo} alt="" /> : (item.attributionName.trim().charAt(0) || "?").toUpperCase()}</span><span>{[item.attributionName, item.where].filter(Boolean).join(" · ")}</span></span>
  </Link>;
}

function DiscoverPerson({ person, index, activity = person.classesThisWeek }: { person: DirPerson; index: number; activity?: number }) {
  return <div className="discover-person-tile"><Link href={`/${person.handle}?from=discover`} className="discover-person-main"><span className="discover-person-face" style={{ background: person.color }}>{person.photo ? <img src={person.photo} alt="" loading={index < 4 ? "eager" : "lazy"} /> : (person.name.trim().charAt(0) || "?").toUpperCase()}</span><span className="discover-person-copy"><strong>{person.name}</strong><small className="discover-person-location">{[activity ? `${activity} this week` : person.title || person.disciplines.slice(0, 2).join(" · "), person.location].filter(Boolean).join(" · ")}</small></span></Link><FavoritePersonButton person={person} /></div>;
}

function StudioGrid({ studios }: { studios: DirStudio[] }) {
  return <div className="discover-studio-grid">{studios.map((studio, index) => <div className="discover-studio-tile" key={studio.id}><Link href={`/s/${studio.slug}?from=discover`}><span className="discover-studio-media">{studio.photo ? <img src={studio.photo} alt="" loading={index < 4 ? "eager" : "lazy"} /> : <span className="discover-studio-placeholder" style={{ background: studio.color }}>{(studio.name.trim().charAt(0) || "?").toUpperCase()}</span>}</span><strong>{studio.name}</strong><small>{studio.types.slice(0, 2).join(" · ") || "Fitness space"}</small></Link><FavoritePlaceButton studio={studio} /></div>)}</div>;
}
