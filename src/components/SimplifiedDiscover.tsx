"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { RowFollow } from "@/components/RowFollow";
import type { DirPerson, DirStudio } from "@/components/DirectoryRows";

type Tab = "people" | "places" | "groups";

export function SimplifiedDiscover({
  people,
  places,
  cities,
  startTab = "people",
}: {
  people: DirPerson[];
  places: DirStudio[];
  cities: string[];
  startTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(startTab);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [city, setCity] = useState("");

  const types = useMemo(
    () => [...new Set(tab === "people" ? people.flatMap((p) => p.disciplines) : places.flatMap((p) => p.types))].sort(),
    [people, places, tab],
  );
  const shownPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) =>
      (!q || `${p.name} ${p.title} ${p.location} ${p.disciplines.join(" ")}`.toLowerCase().includes(q)) &&
      (!type || p.disciplines.includes(type)) &&
      (!city || p.location.toLowerCase().includes(city.toLowerCase())),
    );
  }, [people, query, type, city]);
  const shownPlaces = useMemo(() => {
    const q = query.trim().toLowerCase();
    return places.filter((p) =>
      (!q || `${p.name} ${p.address} ${p.types.join(" ")}`.toLowerCase().includes(q)) &&
      (!type || p.types.includes(type)) &&
      (!city || p.address.toLowerCase().includes(city.toLowerCase())),
    );
  }, [places, query, type, city]);

  const pick = (next: Tab) => {
    setTab(next);
    setQuery("");
    setType("");
    setCity("");
    window.history.replaceState(null, "", next === "people" ? "/discover" : `/discover?half=${next}`);
  };

  return (
    <main className="simple-discover">
      <div className="simple-discover-tabs" role="tablist" aria-label="Discover">
        {(["people", "places", "groups"] as const).map((item) => (
          <button key={item} className={tab === item ? "on" : ""} onClick={() => pick(item)}>
            {item.charAt(0).toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      <label className="simple-discover-search">
        <Icon name="search" size={22} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${tab}`}
        />
      </label>

      <div className="simple-discover-filters">
        <label>
          <span>Location</span>
          <select value={city} onChange={(event) => setCity(event.target.value)}>
            <option value="">Any location</option>
            {cities.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Type</span>
          <select value={type} onChange={(event) => setType(event.target.value)} disabled={tab === "groups"}>
            <option value="">Any type</option>
            {types.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
      </div>

      {tab === "groups" ? (
        <section className="simple-discover-empty">
          <Icon name="groups" size={38} />
          <h2>No groups yet</h2>
          <p>Run clubs, training crews, and whatever your people call themselves will live here.</p>
          <button type="button" disabled>Create a group</button>
          <small>Groups are coming next. For now, follow the people and places you already know.</small>
        </section>
      ) : tab === "people" ? (
        shownPeople.length ? <div className="simple-discover-grid">
          {shownPeople.map((person) => (
            <article key={person.id}>
              <Link href={`/${person.handle}?from=discover`}>
                <Avatar photo={person.photo} color={person.color} name={person.name} />
                <strong>{person.name}</strong>
                <small>{person.location || person.title || "FittList member"}</small>
              </Link>
              <RowFollow
                handle={person.handle}
                name={person.name}
                isCoach={person.kind === "coach"}
                following={person.following}
                requested={person.requested}
              />
            </article>
          ))}
        </div> : <NoResults noun="people" />
      ) : (
        shownPlaces.length ? <div className="simple-discover-grid places">
          {shownPlaces.map((place) => (
            <Link href={`/s/${place.slug}?from=discover`} key={place.id}>
              <Avatar photo={place.photo} color={place.color} name={place.name} square />
              <strong>{place.name}</strong>
              <small>{place.types.slice(0, 2).join(" · ") || "Fitness place"}</small>
            </Link>
          ))}
        </div> : <NoResults noun="places" />
      )}
    </main>
  );
}

function NoResults({ noun }: { noun: "people" | "places" }) {
  return (
    <section className="simple-discover-empty">
      <Icon name="search" size={38} />
      <h2>No {noun} match that</h2>
      <p>Try a broader location or type. The directory gets better every time somebody adds to their week.</p>
    </section>
  );
}

function Avatar({ photo, color, name, square = false }: { photo: string | null; color: string; name: string; square?: boolean }) {
  return photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={square ? "square" : ""} src={photo} alt="" />
  ) : (
    <span className={`avatar-empty${square ? " square" : ""}`} style={{ background: color }}>
      {(name.trim().charAt(0) || "?").toUpperCase()}
    </span>
  );
}
