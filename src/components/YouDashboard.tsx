import Link from "next/link";
import { Icon } from "@/components/Icon";

export type YouFavoritePerson = {
  id: string;
  name: string;
  handle: string;
  photo: string | null;
  color: string;
  title: string;
};

export type YouFavoritePlace = {
  id: string;
  name: string;
  slug: string;
  photo: string | null;
  types: string[];
};

export function YouDashboard({
  me,
  people,
  places,
  managed,
  shareHref,
}: {
  me: {
    name: string;
    handle: string;
    title: string;
    location: string;
    photo: string | null;
    color: string;
  };
  people: YouFavoritePerson[];
  places: YouFavoritePlace[];
  managed: { id: string; name: string; slug: string; admin: boolean }[];
  shareHref: string;
}) {
  const initial = (me.name.charAt(0) || "?").toUpperCase();
  return (
    <main className="youpage">
      <section className="youidentity">
        {me.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="youavatar" src={me.photo} alt="" />
        ) : (
          <span className="youavatar youavatar-empty" style={{ background: me.color }}>
            {initial}
          </span>
        )}
        <div className="youidentity-copy">
          <h1>{me.name}</h1>
          {me.title && <p>{me.title}</p>}
          {me.location && <p>{me.location}</p>}
          <span>fittlist.co/{me.handle}</span>
        </div>
      </section>

      <div className="youactions">
        <Link className="btn si" href={`/${me.handle}`}>Preview public profile</Link>
        <Link className="btn ghost" href="/settings?edit=1">Edit profile</Link>
        <Link className="btn ghost youshare" href={shareHref}>Share profile</Link>
      </div>

      <FavoriteRail
        title="Favorite people"
        empty="Save the people whose calendars you want close by."
        addHref="/discover?seg=coaches"
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
      </FavoriteRail>

      <FavoriteRail
        title="Favorite places"
        empty="Keep the studios and spaces you love in one place."
        addHref="/discover?seg=studios"
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
      </FavoriteRail>

      <FavoriteRail
        title="Groups"
        empty="Groups will give your crew one shared place for everyone’s plans."
        addHref="/groups/new"
      />

      {managed.length > 0 && (
        <section className="yousection">
          <h2>Places you manage</h2>
          <div className="yourows">
            {managed.map((place) => (
              <Link href={`/s/${place.slug}/shifts`} key={place.id}>
                <span><strong>{place.name}</strong><small>Schedule and shifts</small></span>
                <Icon name="chevron_right" size={21} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="yousection yousettingsdoor">
        <Link href="/settings">
          <span><strong>Settings</strong><small>Privacy, notifications, appearance, and account</small></span>
          <Icon name="chevron_right" size={21} />
        </Link>
      </section>
    </main>
  );
}

function FavoriteRail({
  title,
  empty,
  addHref,
  children,
}: {
  title: string;
  empty: string;
  addHref: string;
  children?: React.ReactNode;
}) {
  const hasItems = !!children;
  return (
    <section className="yousection">
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
