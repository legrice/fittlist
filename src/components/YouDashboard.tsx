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
  coaching: boolean;
  hasCalendar: boolean;
};

export type YouFavoritePlace = {
  id: string;
  name: string;
  slug: string;
  photo: string | null;
  types: string[];
};

export type YouFavoriteGroup = {
  id: string;
  name: string;
  slug: string;
  photo: string | null;
  memberCount: number;
  role: string | null;
  nextClass: string | null;
  nextDate: string | null;
  faces: { id: string; name: string; photo: string | null; color: string }[];
};

export type YouGroupInvitation = {
  id: string;
  name: string;
  slug: string;
  role: string;
  inviterName: string;
};

export type YouAccountData = {
  me: {
    name: string;
    handle: string;
    title: string;
    location: string;
    photo: string | null;
    color: string;
    coaching: boolean;
  };
  managed: { id: string; name: string; slug: string; admin: boolean; photo: string | null }[];
  shareHref: string;
  isAdmin: boolean;
  unread: { messages: number; notifications: number };
};

export type YouDashboardData = YouAccountData & {
  people: YouFavoritePerson[];
  places: YouFavoritePlace[];
  yourGroups: YouFavoriteGroup[];
  favoriteGroups: YouFavoriteGroup[];
  groupInvitations: YouGroupInvitation[];
};

export type ProfileSettingsView = "page" | "calendar" | "reach" | "account";

export function YouDashboard({
  me,
  managed,
  shareHref,
  isAdmin,
  unread: _unread,
  people = [],
  places = [],
  yourGroups = [],
  favoriteGroups = [],
  onOpenSettings,
}: YouAccountData & Partial<Pick<YouDashboardData, "people" | "places" | "yourGroups" | "favoriteGroups">> & { onOpenSettings?: (view: ProfileSettingsView) => void }) {
  const initial = (me.name.charAt(0) || "?").toUpperCase();
  const managedGroups = yourGroups.filter((group) => group.role === "owner" || group.role === "admin");
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
        <div className="youaccount-identity">
          <h1>{me.name}</h1>
          <span className="youhandle">@{me.handle}</span>
        </div>
      </section>

      <div className="youquickactions" aria-label="Profile actions">
        <Link href={`/${me.handle}`}>View profile</Link>
        {onOpenSettings ? (
          <button type="button" onClick={() => onOpenSettings("page")}>Edit profile</button>
        ) : (
          <Link href="/settings?edit=1">Edit profile</Link>
        )}
        <Link href={shareHref}>Share</Link>
        {onOpenSettings ? (
          <button type="button" onClick={() => onOpenSettings("account")}>Settings</button>
        ) : (
          <Link href="/settings">Settings</Link>
        )}
      </div>

      <section className="profile-following">
        <h2>Following</h2>
        <div className="profile-following-rail">
          <FollowingCountCircle href="/saved#people" count={people.length} singular="person" plural="people" photo={people.find((person) => person.photo)?.photo ?? null} icon="person" />
          <FollowingCountCircle href="/saved#studios" count={places.length} singular="studio" plural="studios" photo={places.find((place) => place.photo)?.photo ?? null} icon="storefront" />
          <FollowingCountCircle href="/saved#groups" count={favoriteGroups.length} singular="group" plural="groups" photo={favoriteGroups.find((group) => group.photo)?.photo ?? null} icon="groups" />
        </div>
      </section>

      <AccountGroup title="Your calendars">
        <AccountRow icon="calendar_month" title="Personal calendar" detail="View, manage, and share your schedule" href="/calendar" />
          {managed.map((place) => (
            <AccountRow
              icon="storefront"
              title={place.name}
              detail={place.admin ? "Manage calendar and staff" : "Team calendar"}
              href={place.admin ? `/s/${place.slug}/manage` : `/s/${place.slug}/schedule?from=you`}
              avatar={{ photo: place.photo, name: place.name }}
              key={place.id}
            />
          ))}
      </AccountGroup>

      {yourGroups.length > 0 && (
        <AccountGroup title="Your groups">
          {yourGroups.map((group) => (
            <AccountRow
              icon="groups"
              title={group.name}
              detail={managedGroups.some((managedGroup) => managedGroup.id === group.id) ? "Manage calendar and members" : "Group calendar"}
              href={`/g/${group.slug}`}
              avatar={{ photo: group.photo, name: group.name }}
              key={group.id}
            />
          ))}
        </AccountGroup>
      )}

      <AccountGroup title="Saved items">
        <AccountRow icon="bookmark" title="Saved classes and events" detail="Everything you added to your personal calendar" href="/calendar" />
      </AccountGroup>

      <AccountGroup title="Settings">
        <SettingsRow icon="account_circle" title="Profile & public page" detail="Profile, handle, contact info, and availability" view="page" onOpen={onOpenSettings} />
        <SettingsRow icon="event" title="Calendar & sync" detail="Google, Apple and Outlook, your week as text" view="calendar" onOpen={onOpenSettings} />
        <SettingsRow icon="public_off" title="Privacy & communication" detail="Messages, listing, approvals, and removed people" view="reach" onOpen={onOpenSettings} />
        <SettingsRow icon="lock" title="Account & preferences" detail="Login, notifications, appearance, and account access" view="account" onOpen={onOpenSettings} />
      </AccountGroup>

      {isAdmin && (
        <AccountGroup title="Admin tools">
          <AccountRow icon="admin_panel_settings" title="Admin" detail="Site operations and reports" href="/admin" />
        </AccountGroup>
      )}

      <AccountGroup title="Support & legal">
        <AccountRow icon="forum" title="Help and support" detail="Get help with FittList" href="/support" />
        <AccountRow icon="mail" title="Send feedback" detail="Tell us what you think" href="/feedback" />
        <AccountRow icon="shield" title="Privacy policy" detail="How FittList handles your information" href="/privacy" />
      </AccountGroup>

      <AccountGroup title="Actions">
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

function SettingsRow({
  icon,
  title,
  detail,
  view,
  onOpen,
}: {
  icon: string;
  title: string;
  detail: string;
  view: ProfileSettingsView;
  onOpen?: (view: ProfileSettingsView) => void;
}) {
  if (!onOpen) {
    return <AccountRow icon={icon} title={title} detail={detail} href="/settings" />;
  }
  return (
    <button className="youaccount-row" type="button" onClick={() => onOpen(view)}>
      <span className="youaccount-icon"><Icon name={icon} size={20} /></span>
      <span className="youaccount-copy"><strong>{title}</strong><small>{detail}</small></span>
      <Icon className="youaccount-chevron" name="chevron_right" size={19} />
    </button>
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

function FollowingCountCircle({ href, count, singular, plural, photo, icon }: { href: string; count: number; singular: string; plural: string; photo: string | null; icon: string }) {
  return <Link className="profile-following-item" href={href}>
    <span>
      {photo ? <img src={photo} alt="" /> : <Icon name={icon} size={28} />}
    </span>
    <strong>{count} {count === 1 ? singular : plural}</strong>
  </Link>;
}

function AccountRow({ icon, title, detail, href, count = 0, avatar }: { icon: string; title: string; detail?: string; href: string; count?: number; avatar?: { photo: string | null; name: string } }) {
  return (
    <Link className="youaccount-row" href={href}>
      {avatar ? <span className="youaccount-icon youaccount-place-avatar">{avatar.photo ? <img src={avatar.photo} alt="" /> : <span>{(avatar.name.trim().charAt(0) || "?").toUpperCase()}</span>}</span> : <span className="youaccount-icon"><Icon name={icon} size={20} /></span>}
      <span className="youaccount-copy">
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </span>
      {count > 0 && <b className="youaccount-unread" aria-label={`${count} unread`}>{count > 99 ? "99+" : count}</b>}
      <Icon className="youaccount-chevron" name="chevron_right" size={19} />
    </Link>
  );
}
