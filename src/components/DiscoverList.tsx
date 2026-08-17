"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { DirPerson, DirStudio } from "@/components/DirectoryRows";
import { RowFollow } from "@/components/RowFollow";
import type { BrowseDay } from "@/app/actions/discover";

function rankByUse(values: (string | null | undefined)[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.keys()].sort(
    (a, b) => (counts.get(b)! - counts.get(a)!) || a.localeCompare(b),
  );
}

export type DiscoverHalf = "for-you" | "people" | "places";
type DiscoverFilter = "type" | "location";
const NEAR_ME = "__near_me__";

export function DiscoverList({
  people,
  studios = [],
  cities,
  myCity = null,
  backHref,
  hideBack = false,
  startHalf = "for-you",
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
  const tab = startHalf;
  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedCity, setSelectedCity] = useState(myCity ? NEAR_ME : "");
  const [filterMenu, setFilterMenu] = useState<DiscoverFilter | null>(null);
  const effectiveCity = selectedCity === NEAR_ME ? (myCity ?? "") : selectedCity;

  const shownPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .filter(
        (person) =>
          !q ||
          person.name.toLowerCase().includes(q) ||
          person.title.toLowerCase().includes(q) ||
          person.location.toLowerCase().includes(q) ||
          person.handle.toLowerCase().includes(q) ||
          person.disciplines.some((discipline) => discipline.toLowerCase().includes(q)),
      )
      .filter((person) => !selectedType || person.disciplines.includes(selectedType))
      .filter(
        (person) =>
          !effectiveCity || person.location.toLowerCase().includes(effectiveCity.toLowerCase()),
      );
  }, [people, query, effectiveCity, selectedType]);

  const shownStudios = useMemo(() => {
    const q = query.trim().toLowerCase();
    return studios.filter((studio) => {
      if (
        q &&
        !studio.name.toLowerCase().includes(q) &&
        !studio.address.toLowerCase().includes(q) &&
        !studio.types.some((type) => type.toLowerCase().includes(q))
      ) return false;
      if (selectedType && !studio.types.includes(selectedType)) return false;
      if (effectiveCity && !studio.address.toLowerCase().includes(effectiveCity.toLowerCase())) return false;
      return true;
    });
  }, [studios, query, effectiveCity, selectedType]);

  const types = useMemo(() => {
    if (tab === "places") return rankByUse(studios.flatMap((studio) => studio.types));
    if (tab === "people") return rankByUse(people.flatMap((person) => person.disciplines));
    return [];
  }, [people, studios, tab]);

  const filterOptions = filterMenu === "type"
    ? [{ value: "", label: "Any type" }, ...types.map((value) => ({ value, label: value }))]
    : [
        { value: "", label: "Everywhere" },
        ...(myCity ? [{ value: NEAR_ME, label: `Near ${myCity.split(",")[0]}` }] : []),
      ];
  const filterValue = filterMenu === "type" ? selectedType : selectedCity;

  const chooseFilter = (value: string) => {
    if (filterMenu === "type") setSelectedType(value);
    if (filterMenu === "location") setSelectedCity(value);
    setFilterMenu(null);
  };

  const tabs: { key: DiscoverHalf; label: string; href: string }[] = [
    { key: "for-you", label: "For you", href: "/discover" },
    { key: "people", label: "People", href: "/discover?half=people" },
    { key: "places", label: "Places", href: "/discover?half=places" },
  ];

  const upcomingItems = upcoming.flatMap((day) => day.items.map((item) => ({ ...item, day: day.label }))).slice(0, 6);
  const activityByName = upcoming.flatMap((day) => day.items).reduce((counts, item) => {
    const key = item.attributionName.trim().toLowerCase();
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const activityFor = (person: DirPerson) => activityByName.get(person.name.trim().toLowerCase()) ?? person.classesThisWeek;
  const activePeople = shownPeople
    .filter((person) => person.kind === "coach")
    .sort((a, b) => activityFor(b) - activityFor(a) || Number(!!b.photo) - Number(!!a.photo))
    .slice(0, 6);
  const featuredStudios = shownStudios.slice(0, 6);

  return (
    <>
      <div className="discover-tabs" role="tablist" aria-label="Explore sections">
        {tabs.map((item) => (
          <Link
            key={item.key}
            role="tab"
            className={tab === item.key ? "on" : ""}
            aria-selected={tab === item.key}
            href={item.href}
            prefetch={false}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="dissearchrow discover-searchrow">
        <label className="dissearch">
          <Icon name="search" size={20} className="dissearch-ic" />
          <input
            className="dissearch-in"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          placeholder="Search people and places"
          aria-label="Search people and places"
          />
          {query && (
            <button type="button" className="dissearch-x" onClick={() => setQuery("")} aria-label="Clear search">
              <Icon name="close" size={19} />
            </button>
          )}
        </label>
      </div>

      <div className="discover-filterrow" aria-label="Discover filters">
        <button
          type="button"
          className={`discover-filterpill${selectedCity ? " on" : ""}`}
          onClick={() => setFilterMenu("location")}
        >
          {selectedCity === NEAR_ME ? `Near ${myCity?.split(",")[0] ?? "me"}` : "Everywhere"}
          <Icon name="expand_more" size={17} />
        </button>
        {tab !== "for-you" && <button
          type="button"
          className={`discover-filterpill${selectedType ? " on" : ""}`}
          onClick={() => setFilterMenu("type")}
        >
          {selectedType || "Any type"}
          <Icon name="expand_more" size={17} />
        </button>}
      </div>

      {filterMenu && (
        <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) setFilterMenu(null); }}>
          <div className="sheet discover-filter-sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setFilterMenu(null)}>
              <Icon name="close" size={18} />
            </button>
            <h2>{filterMenu === "type" ? "Type" : "Area"}</h2>
            <div className="discover-filter-options">
              {filterOptions.map((option) => (
                <button type="button" className="clsopt" key={option.value} onClick={() => chooseFilter(option.value)}>
                  <span>{option.label}</span>
                  {option.value === filterValue && <Icon className="clsopt-on" name="check" size={21} />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "for-you" ? (
        <div className="discover-for-you">
          <header className="discover-welcome">
            <h1>Find something for your week</h1>
            <p>Upcoming classes, active coaches, and places worth knowing.</p>
          </header>
          {upcomingItems.length > 0 && (
            <DiscoverSection title="Happening this week">
              <div className="discover-event-rail">
                {upcomingItems.map((item) => (
                  <Link className="discover-event-card" href={`/${item.base}/${item.classId}?d=${item.iso}&from=discover`} key={`${item.classId}.${item.iso}`}>
                    <small>{item.day} · {item.hm}{item.ap.toLowerCase()}</small>
                    <strong>{item.name}</strong>
                    <span>{[item.attributionName, item.where].filter(Boolean).join(" · ")}</span>
                  </Link>
                ))}
              </div>
            </DiscoverSection>
          )}
          <DiscoverSection title="Coaches to explore" href="/discover?half=people">
            <div className="discover-person-grid">
              {activePeople.map((person, index) => <DiscoverPerson person={person} index={index} activity={activityFor(person)} key={person.id} />)}
            </div>
          </DiscoverSection>
          <DiscoverSection title="Places to explore" href="/discover?half=places">
            <StudioGrid studios={featuredStudios} />
          </DiscoverSection>
        </div>
      ) : tab === "places" ? (
        shownStudios.length === 0 ? (
          <div className="empty-block">
            <h2>No places here yet</h2>
            <p>Places appear as people add where they train.</p>
          </div>
        ) : (
          <StudioGrid studios={shownStudios} />
        )
      ) : shownPeople.length === 0 ? (
        <div className="empty-block">
          <h2>No people here yet</h2>
          <p>Try another location or type.</p>
        </div>
      ) : (
        <div className="discover-person-grid">
          {shownPeople.map((person, index) => <DiscoverPerson person={person} index={index} key={person.id} />)}
        </div>
      )}

      {!hideBack && <Link className="logoutbtn" href={backHref}>Back to your week</Link>}
    </>
  );
}

function DiscoverSection({ title, href, children }: { title: string; href?: string; children: ReactNode }) {
  return <section className="discover-section"><div className="discover-section-head"><h2>{title}</h2>{href && <Link href={href}>See all</Link>}</div>{children}</section>;
}

function DiscoverPerson({ person, index, activity = person.classesThisWeek }: { person: DirPerson; index: number; activity?: number }) {
  return <div className="discover-person-tile"><Link href={`/${person.handle}?from=discover`} className="discover-person-main"><span className="discover-person-face" style={{ background: person.color }}>{person.photo ? <img src={person.photo} alt="" loading={index < 4 ? "eager" : "lazy"} /> : (person.name.trim().charAt(0) || "?").toUpperCase()}</span><span className="discover-person-copy"><strong>{person.name}</strong><small className="discover-person-location">{[activity ? `${activity} this week` : person.title || person.disciplines.slice(0, 2).join(" · "), person.location].filter(Boolean).join(" · ")}</small></span></Link><RowFollow handle={person.handle} name={person.name} isCoach={person.kind === "coach"} following={person.following} requested={person.requested} /></div>;
}

function StudioGrid({ studios }: { studios: DirStudio[] }) {
  return <div className="discover-studio-grid">{studios.map((studio, index) => <Link href={`/s/${studio.slug}?from=discover`} className="discover-studio-tile" key={studio.id}>{studio.photo ? <img src={studio.photo} alt="" loading={index < 4 ? "eager" : "lazy"} /> : <span className="discover-studio-placeholder" style={{ background: studio.color }}>{(studio.name.trim().charAt(0) || "?").toUpperCase()}</span>}<strong>{studio.name}</strong><small>{studio.types.slice(0, 2).join(" · ") || "Fitness space"}</small></Link>)}</div>;
}
