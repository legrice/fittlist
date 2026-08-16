import Link from "next/link";
import { logout } from "@/app/actions/auth";
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
      <section className="youaccount-head">
        {me.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="youavatar" src={me.photo} alt="" />
        ) : (
          <span className="youavatar youavatar-empty" style={{ background: me.color }}>
            {initial}
          </span>
        )}
        <h1>{me.name}</h1>
        <p>{me.title || "Your FittList account"}</p>
        {me.location && <p>{me.location}</p>}
        <span className="youhandle">@{me.handle}</span>
      </section>

      <div className="youquickactions" aria-label="Profile actions">
        <Link href={`/${me.handle}`}>View profile</Link>
        <Link href="/settings?edit=1">Edit profile</Link>
        <Link href={shareHref}>Share</Link>
      </div>

      <h2 className="yougroup-title youfavorites-title">Favorites</h2>
      <FavoriteRail
        title="People"
        empty="Save the people whose calendars you want close by."
        addHref="/discover?seg=coaches"
        kind="people"
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
        title="Places"
        empty="Keep the studios and spaces you love in one place."
        addHref="/discover?seg=studios"
        kind="places"
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
        kind="groups"
      />

      <AccountGroup title="Your account">
        <AccountRow icon="forum" title="Messages" detail="Your conversations" href="/inbox" />
        <AccountRow icon="notifications" title="Notifications" detail="Updates about your account and activity" href="/notifications" />
      </AccountGroup>

      {managed.length > 0 && (
        <AccountGroup title="Places you manage">
          {managed.map((place) => (
            <AccountRow
              icon="storefront"
              title={place.name}
              detail="Schedule and shifts"
              href={`/s/${place.slug}/shifts`}
              key={place.id}
            />
          ))}
        </AccountGroup>
      )}

      <AccountGroup title="Settings">
        <AccountRow icon="settings" title="Settings" detail="Privacy, appearance, and account" href="/settings" />
        <AccountRow icon="forum" title="Help and support" detail="Get help with FittList" href="/support" />
        <AccountRow icon="shield" title="Privacy" detail="Read our privacy policy" href="/privacy" />
      </AccountGroup>

      <AccountGroup title="Actions">
        <AccountRow icon="mail" title="Send feedback" detail="Tell us what you think" href="/feedback" />
        <form action={logout} className="youlogout">
          <button className="youaccount-row" type="submit">
            <span className="youaccount-icon"><Icon name="arrow_outward" size={20} /></span>
            <span className="youaccount-copy"><strong>Log out</strong></span>
            <Icon className="youaccount-chevron" name="chevron_right" size={19} />
          </button>
        </form>
      </AccountGroup>
    </main>
  );
}

function AccountGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="youaccount-group">
      <h2 className="yougroup-title">{title}</h2>
      <div>{children}</div>
    </section>
  );
}

function AccountRow({ icon, title, detail, href }: { icon: string; title: string; detail?: string; href: string }) {
  return (
    <Link className="youaccount-row" href={href}>
      <span className="youaccount-icon"><Icon name={icon} size={20} /></span>
      <span className="youaccount-copy">
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </span>
      <Icon className="youaccount-chevron" name="chevron_right" size={19} />
    </Link>
  );
}

function FavoriteRail({
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
  children?: React.ReactNode;
}) {
  const hasItems = !!children;
  return (
    <section className="yousection">
      <div className="yousection-head"><h2>{title}</h2></div>
      <div className={`youfavrail youfavrail-${kind}`}>
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
