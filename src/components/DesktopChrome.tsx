"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { LinkPending } from "@/components/LinkPending";
import { Wordmark } from "@/components/Wordmark";
import { activeTab, navTabs, type NavTab } from "@/lib/nav";

type DesktopPerson = {
  name: string;
  location: string | null;
  photo: string | null;
  color: string;
  initial: string;
};

/**
 * Desktop gets a real application frame rather than a phone header stretched
 * across a monitor. It is deliberately absent below the desktop breakpoint:
 * the native app and mobile web keep their existing header and thumb bar.
 */
export function DesktopChrome({
  coach,
  scheduleHref,
  profileHref,
  person,
  notificationUnread = 0,
  messageUnread = 0,
  admin = false,
  adminAttention = 0,
  active,
}: {
  coach: boolean;
  scheduleHref: string;
  profileHref: string;
  person: DesktopPerson;
  notificationUnread?: number;
  messageUnread?: number;
  admin?: boolean;
  adminAttention?: number;
  active?: NavTab;
}) {
  const pathname = usePathname();
  const here = activeTab(pathname, active);
  const links = navTabs(coach, scheduleHref, profileHref);

  return (
    <>
      <aside className="desktop-left" aria-label="Desktop navigation">
        <Link className="desktop-logo" href="/feed" aria-label="FittList home">
          <Wordmark variant="ink" />
        </Link>
        <nav className="desktop-nav" aria-label="Main">
          {links.map((item) => {
            const on = here === item.id;
            return (
              <Link
                key={item.id}
                className={`desktop-nav-link${on ? " on" : ""}`}
                href={item.href}
                aria-current={on ? "page" : undefined}
              >
                <Icon name={item.icon} size={22} />
                <span>{item.label}</span>
                <LinkPending className="desktop-nav-spin" />
              </Link>
            );
          })}
          <Link className={`desktop-nav-link${pathname.startsWith("/inbox") ? " on" : ""}`} href="/inbox">
            <Icon name="chat_bubble" size={22} />
            <span>Messages</span>
            {messageUnread > 0 && <b className="desktop-count">{messageUnread > 9 ? "9+" : messageUnread}</b>}
          </Link>
          <Link className={`desktop-nav-link${pathname.startsWith("/notifications") ? " on" : ""}`} href="/notifications">
            <Icon name="notifications" size={22} />
            <span>Notifications</span>
            {notificationUnread > 0 && <b className="desktop-count">{notificationUnread > 9 ? "9+" : notificationUnread}</b>}
          </Link>
          {admin && (
            <Link className={`desktop-nav-link${pathname.startsWith("/admin") ? " on" : ""}`} href="/admin">
              <Icon name="admin_panel_settings" size={22} />
              <span>Admin</span>
              {adminAttention > 0 && <b className="desktop-count">{adminAttention > 9 ? "9+" : adminAttention}</b>}
            </Link>
          )}
        </nav>
        <Link className="desktop-create" href="/calendar?add=1">
          <Icon name="add" size={21} />
          Add a class
        </Link>
      </aside>

      <aside className="desktop-right" aria-label="Your profile">
        <section className="desktop-profile-card">
          <div className="desktop-profile-kicker">Your profile</div>
          <Link className="desktop-profile-person" href={profileHref}>
            {person.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={person.photo} alt="" />
            ) : (
              <span style={{ background: person.color }}>{person.initial}</span>
            )}
            <div>
              <strong>{person.name}</strong>
              {person.location && <small>{person.location}</small>}
            </div>
          </Link>
          <div className="desktop-profile-actions">
            <Link href={profileHref}>View profile</Link>
            <Link href={coach ? "/coachshare" : "/membershare"}>Share your week</Link>
          </div>
        </section>
        <section className="desktop-week-card">
          <strong>Your week in fitness.</strong>
          <p>Keep your schedule current, then share it from one place.</p>
          <Link href={scheduleHref}>Open your schedule <Icon name="arrow_forward" size={18} /></Link>
        </section>
      </aside>
    </>
  );
}
