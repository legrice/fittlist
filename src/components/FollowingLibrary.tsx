"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { RowFollow } from "@/components/RowFollow";

export type FollowedPerson = {
  id: string;
  handle: string;
  name: string;
  sub: string;
  photo: string | null;
  color: string;
};

export type FollowedPlace = {
  id: string;
  slug: string;
  name: string;
  sub: string;
  photo: string | null;
  color: string;
};

/**
 * Following is a library, not a feed. Nothing is poured together here: pick
 * the person or place whose calendar you mean, then read that one calendar.
 */
export function FollowingLibrary({
  people,
  places,
}: {
  people: FollowedPerson[];
  places: FollowedPlace[];
}) {
  const [tab, setTab] = useState<"people" | "places">("people");
  const empty = tab === "people" ? people.length === 0 : places.length === 0;

  return (
    <main className="following-library">
      <div className="following-library-head">
        <h1>Following</h1>
        <p>Open one calendar at a time. No giant feed, no noise.</p>
      </div>

      <div className="following-library-tabs" role="tablist" aria-label="Following">
        <button className={tab === "people" ? "on" : ""} onClick={() => setTab("people")}>
          People
        </button>
        <button className={tab === "places" ? "on" : ""} onClick={() => setTab("places")}>
          Places &amp; groups
        </button>
      </div>

      {empty ? (
        <section className="following-library-empty">
          <Icon name={tab === "people" ? "group" : "location_on"} size={34} />
          <h2>{tab === "people" ? "Nobody here yet" : "No places or groups yet"}</h2>
          <p>
            {tab === "people"
              ? "Find someone whose fitness you want to keep up with."
              : "Places you save will stay here, ready when you want their schedule."}
          </p>
          <Link href={`/discover${tab === "places" ? "?half=places" : ""}`}>
            {tab === "people" ? "Find people" : "Find places"}
          </Link>
        </section>
      ) : tab === "people" ? (
        <div className="following-library-list">
          {people.map((person) => (
            <article className="following-library-row" key={person.id}>
              <Link href={`/${person.handle}?from=following`}>
                <Avatar photo={person.photo} color={person.color} name={person.name} />
                <span>
                  <strong>{person.name}</strong>
                  <small>{person.sub}</small>
                </span>
              </Link>
              <RowFollow handle={person.handle} name={person.name} isCoach following requested={false} />
            </article>
          ))}
        </div>
      ) : (
        <div className="following-library-list">
          {places.map((place) => (
            <article className="following-library-row" key={place.id}>
              <Link href={`/s/${place.slug}?from=following`}>
                <Avatar photo={place.photo} color={place.color} name={place.name} square />
                <span>
                  <strong>{place.name}</strong>
                  <small>{place.sub}</small>
                </span>
              </Link>
              <Icon name="chevron_right" size={20} />
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

function Avatar({
  photo,
  color,
  name,
  square = false,
}: {
  photo: string | null;
  color: string;
  name: string;
  square?: boolean;
}) {
  return photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={`following-library-avatar${square ? " square" : ""}`} src={photo} alt="" />
  ) : (
    <span className={`following-library-avatar empty${square ? " square" : ""}`} style={{ background: color }}>
      {(name.trim().charAt(0) || "?").toUpperCase()}
    </span>
  );
}
