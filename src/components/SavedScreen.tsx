import Link from "next/link";
import { Children, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import type { YouFavoritePerson, YouFavoritePlace } from "@/components/YouDashboard";

export function SavedScreen({
  people,
  places,
}: {
  people: YouFavoritePerson[];
  places: YouFavoritePlace[];
}) {
  return (
    <main className="savedpage">
      <header className="savedhead">
        <h1>Your favorites</h1>
      </header>

      <SavedRail
        kind="people"
        title="People"
        empty="Save the people whose calendars you want close by. Each calendar stays separate."
        addHref="/discover"
      >
        {people.map((person) => (
          <Link className="youfav" href={`/${person.handle}`} key={person.id}>
            {person.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={person.photo} alt="" />
            ) : (
              <span style={{ background: person.color }}>{person.name.charAt(0).toUpperCase()}</span>
            )}
            <strong>{person.name}</strong>
            {person.title && <small>{person.title}</small>}
          </Link>
        ))}
      </SavedRail>

      <SavedRail
        kind="places"
        title="Places"
        empty="Save studios and spaces to find their schedules again quickly."
        addHref="/discover?half=places"
      >
        {places.map((place) => (
          <Link className="youfav" href={`/s/${place.slug}`} key={place.id}>
            {place.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={place.photo} alt="" />
            ) : (
              <span>{place.name.charAt(0).toUpperCase()}</span>
            )}
            <strong>{place.name}</strong>
            {place.types.length > 0 && <small>{place.types.slice(0, 2).join(" · ")}</small>}
          </Link>
        ))}
      </SavedRail>

      <SavedRail
        kind="groups"
        title="Groups"
        empty="Groups will give your crew one shared place for plans you mean to combine."
        addHref="/discover?half=groups"
      />
    </main>
  );
}

function SavedRail({
  title,
  empty,
  addHref,
  kind,
  children,
}: {
  title: string;
  empty: string;
  addHref: string;
  kind: "people" | "places" | "groups";
  children?: ReactNode;
}) {
  const hasItems = Children.count(children) > 0;
  return (
    <section className={`yousection savedsection savedsection-${kind}`}>
      <div className="yousection-head"><h2>{title}</h2></div>
      <div className="youfavrail">
        {children}
        <Link className="youfav youfav-add" href={addHref}>
          <span><Icon name="add" size={28} /></span>
          <strong>{hasItems ? "Add more" : "Add"}</strong>
        </Link>
      </div>
      {!hasItems && <p className="youemptycopy">{empty}</p>}
    </section>
  );
}
