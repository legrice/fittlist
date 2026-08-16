"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { DirPerson, DirStudio } from "@/components/DirectoryRows";
import { RowFollow } from "@/components/RowFollow";

function rankByUse(values: (string | null | undefined)[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.keys()].sort(
    (a, b) => (counts.get(b)! - counts.get(a)!) || a.localeCompare(b),
  );
}

export type DiscoverHalf = "people" | "places" | "groups";
type DiscoverFilter = "type" | "location";
const NEAR_ME = "__near_me__";

export function DiscoverList({
  people,
  studios = [],
  cities,
  myCity = null,
  backHref,
  hideBack = false,
  startHalf = "people",
}: {
  people: DirPerson[];
  studios?: DirStudio[];
  cities: string[];
  myCity?: string | null;
  backHref: string;
  hideBack?: boolean;
  startHalf?: DiscoverHalf;
}) {
  const tab = startHalf;
  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
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
        { value: "", label: "Any location" },
        ...(myCity ? [{ value: NEAR_ME, label: "Near me" }] : []),
        ...cities.map((value) => ({ value, label: value })),
      ];
  const filterValue = filterMenu === "type" ? selectedType : selectedCity;

  const chooseFilter = (value: string) => {
    if (filterMenu === "type") setSelectedType(value);
    if (filterMenu === "location") setSelectedCity(value);
    setFilterMenu(null);
  };

  const tabs: { key: DiscoverHalf; label: string; href: string }[] = [
    { key: "people", label: "People", href: "/discover" },
    { key: "places", label: "Places", href: "/discover?half=places" },
    { key: "groups", label: "Groups", href: "/discover?half=groups" },
  ];

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
            placeholder={`Search ${tab}`}
            aria-label={`Search ${tab}`}
          />
          {query && (
            <button type="button" className="dissearch-x" onClick={() => setQuery("")} aria-label="Clear search">
              <Icon name="close" size={19} />
            </button>
          )}
        </label>
      </div>

      <div className="discover-filterrow" aria-label={`${tab} filters`}>
        <button
          type="button"
          className={`discover-filterpill${selectedCity ? " on" : ""}`}
          onClick={() => setFilterMenu("location")}
        >
          {selectedCity === NEAR_ME ? "Near me" : selectedCity || "Any location"}
          <Icon name="expand_more" size={17} />
        </button>
        <button
          type="button"
          className={`discover-filterpill${selectedType ? " on" : ""}`}
          onClick={() => setFilterMenu("type")}
        >
          {selectedType || "Any type"}
          <Icon name="expand_more" size={17} />
        </button>
      </div>

      {filterMenu && (
        <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) setFilterMenu(null); }}>
          <div className="sheet discover-filter-sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setFilterMenu(null)}>
              <Icon name="close" size={18} />
            </button>
            <h2>{filterMenu === "type" ? "Type" : "Location"}</h2>
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

      {tab === "groups" ? (
        <div className="empty-block">
          <h2>No groups yet</h2>
          <p>Groups will give your crew one shared place for everyone&rsquo;s plans.</p>
        </div>
      ) : tab === "places" ? (
        shownStudios.length === 0 ? (
          <div className="empty-block">
            <h2>No places here yet</h2>
            <p>Places appear as people add where they train.</p>
          </div>
        ) : (
          <div className="discover-studio-grid">
            {shownStudios.map((studio, index) => (
              <Link href={`/s/${studio.slug}?from=discover`} className="discover-studio-tile" key={studio.id}>
                {studio.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={studio.photo} alt="" loading={index < 4 ? "eager" : "lazy"} fetchPriority={index < 2 ? "high" : "auto"} decoding="async" />
                ) : (
                  <span className="discover-studio-placeholder" style={{ background: studio.color }}>
                    {(studio.name.trim().charAt(0) || "?").toUpperCase()}
                  </span>
                )}
                <strong>{studio.name}</strong>
                <small>{studio.types.slice(0, 2).join(" · ") || "Fitness space"}</small>
              </Link>
            ))}
          </div>
        )
      ) : shownPeople.length === 0 ? (
        <div className="empty-block">
          <h2>No people here yet</h2>
          <p>Try another location or type.</p>
        </div>
      ) : (
        <div className="discover-person-grid">
          {shownPeople.map((person, index) => (
            <div className="discover-person-tile" key={person.id}>
              <Link href={`/${person.handle}?from=discover`} className="discover-person-main">
                <span className="discover-person-face" style={{ background: person.color }}>
                  {person.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={person.photo} alt="" loading={index < 4 ? "eager" : "lazy"} fetchPriority={index < 2 ? "high" : "auto"} decoding="async" />
                  ) : (
                    (person.name.trim().charAt(0) || "?").toUpperCase()
                  )}
                </span>
                <strong>{person.name}</strong>
                {person.location && <small className="discover-person-location">{person.location}</small>}
              </Link>
              <RowFollow
                handle={person.handle}
                name={person.name}
                isCoach={person.kind === "coach"}
                following={person.following}
                requested={person.requested}
              />
            </div>
          ))}
        </div>
      )}

      {!hideBack && <Link className="logoutbtn" href={backHref}>Back to your week</Link>}
    </>
  );
}
