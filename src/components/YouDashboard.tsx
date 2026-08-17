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

export type YouDashboardData = {
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
};

export function YouDashboard({
  me,
  managed,
  shareHref,
}: YouDashboardData) {
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
