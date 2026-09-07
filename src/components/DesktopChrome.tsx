"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { GlobalAdd } from "@/components/GlobalAdd";
import { LinkPending } from "@/components/LinkPending";
import { Wordmark } from "@/components/Wordmark";
import { activeTab, navTabs, type NavTab } from "@/lib/nav";
import type { ManagedCalendarDestination } from "@/lib/managed-calendars";

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
  adminActivity = 0,
  active,
  managedCalendars = [],
}: {
  coach: boolean;
  scheduleHref: string;
  profileHref: string;
  person: DesktopPerson;
  notificationUnread?: number;
  messageUnread?: number;
  admin?: boolean;
  adminAttention?: number;
  adminActivity?: number;
  active?: NavTab;
  managedCalendars?: ManagedCalendarDestination[];
}) {
  const pathname = usePathname();
  const here = activeTab(pathname, active);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!calendarOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!calendarRef.current?.contains(event.target as Node)) setCalendarOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCalendarOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [calendarOpen]);

  const managedHref = (calendar: ManagedCalendarDestination) =>
    calendar.kind === "studio" ? `/s/${calendar.slug}/manage/calendar` : `/g/${calendar.slug}`;
  const managedActive = managedCalendars.some((calendar) => pathname.startsWith(managedHref(calendar)));
  const personalOn = pathname === "/calendar";
  const followingOn = pathname === "/feed" || pathname.startsWith("/calendar/following");
  const calendarOn = personalOn || managedActive;
  const profileOn = pathname.startsWith(profileHref) || pathname.startsWith("/settings") ||
    (active === "calendar" && !pathname.startsWith("/calendar"));
  // Profile is anchored to the bottom of the desktop rail. Every other
  // primary destination, including Share, stays in the main navigation so
  // removing the secondary right rail never removes a capability.
  const links = navTabs(coach, scheduleHref, profileHref).filter((item) => item.id !== "calendar" && item.id !== "following");

  return (
    <>
      <aside className="desktop-left" aria-label="Desktop navigation">
        <Link className="desktop-logo" href="/calendar" aria-label="FittList calendar">
          <Wordmark variant="ink" />
        </Link>
        <div className="desktop-profile-row">
          <Link
            className={`desktop-profile-link${profileOn ? " on" : ""}`}
            href={profileHref}
            aria-current={profileOn ? "page" : undefined}
          >
            {person.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={person.photo} alt="" />
            ) : (
              <span className="desktop-profile-avatar-empty" style={{ background: person.color }}>{person.initial}</span>
            )}
            <span>Profile</span>
          </Link>
          {admin && (
            <Link className="desktop-profile-activity" href="/admin?activity=1" aria-label={adminActivity > 0 ? "New product activity" : "Product activity"}>
              <Icon name="activity" size={19} />
              {adminActivity > 0 && <i aria-hidden="true" />}
            </Link>
          )}
        </div>
        <nav className="desktop-nav" aria-label="Main">
          <div className={`desktop-calendar-switcher${calendarOn ? " on" : ""}${calendarOpen ? " open" : ""}`} ref={calendarRef}>
            <Link className="desktop-calendar-main" href="/calendar" aria-current={personalOn ? "page" : undefined} onClick={() => setCalendarOpen(false)}>
              <Icon name="calendar_month" size={22} />
              <span>Calendar</span>
              <LinkPending className="desktop-nav-spin" />
            </Link>
            <button
              type="button"
              className="desktop-calendar-toggle"
              aria-label="Choose a calendar"
              aria-expanded={calendarOpen}
              aria-controls="desktop-calendar-menu"
              onClick={() => setCalendarOpen((open) => !open)}
            >
              <Icon name="expand_more" size={21} />
            </button>
            {calendarOpen && (
              <div className="desktop-calendar-menu" id="desktop-calendar-menu" role="menu">
                <Link href={scheduleHref} role="menuitem" className={personalOn ? "selected" : ""} onClick={() => setCalendarOpen(false)}>
                  <span className="desktop-calendar-menu-icon"><Icon name="person" size={19} /></span>
                  <span><strong>Your calendar</strong><small>Your classes and shifts</small></span>
                  {personalOn && <Icon name="check" size={18} />}
                </Link>
                {managedCalendars.length > 0 && <p role="presentation">Managed calendars</p>}
                {managedCalendars.map((calendar) => {
                  const href = managedHref(calendar);
                  const selected = pathname.startsWith(href);
                  return (
                    <Link href={href} role="menuitem" className={selected ? "selected" : ""} onClick={() => setCalendarOpen(false)} key={`${calendar.kind}:${calendar.id}`}>
                      <span className={`desktop-calendar-menu-icon ${calendar.kind}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {calendar.photo ? <img src={calendar.photo} alt="" /> : <Icon name={calendar.kind === "studio" ? "storefront" : "groups"} size={19} />}
                      </span>
                      <span><strong>{calendar.name}</strong><small>{calendar.kind === "studio" ? "Studio calendar" : "Group calendar"}</small></span>
                      {selected && <Icon name="check" size={18} />}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
          <Link className={`desktop-nav-link${followingOn ? " on" : ""}`} href="/calendar/following" aria-current={followingOn ? "page" : undefined}>
            <Icon name="calendar_view_day" size={22} /><span>Following</span><LinkPending className="desktop-nav-spin" />
          </Link>
          <Link className={`desktop-nav-link${pathname === "/search" ? " on" : ""}`} href="/search" aria-current={pathname === "/search" ? "page" : undefined}>
            <Icon name="search" size={22} /><span>Search</span><LinkPending className="desktop-nav-spin" />
          </Link>
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
          <Link className={`desktop-nav-link${pathname.startsWith("/inbox") ? " on" : ""}`} href="/inbox" aria-current={pathname.startsWith("/inbox") ? "page" : undefined}>
            <Icon name="chat_bubble" size={22} />
            <span>Messages</span>
            {messageUnread > 0 && <b className="desktop-count desktop-unread-count" aria-label={`${messageUnread} unread messages`}>{messageUnread > 99 ? "99+" : messageUnread}</b>}
          </Link>
          <Link className={`desktop-nav-link${pathname.startsWith("/notifications") ? " on" : ""}`} href="/notifications" aria-current={pathname.startsWith("/notifications") ? "page" : undefined}>
            <Icon name="notifications" size={22} />
            <span>Notifications</span>
            {notificationUnread > 0 && <b className="desktop-count desktop-unread-count" aria-label={`${notificationUnread} unread notifications`}>{notificationUnread > 99 ? "99+" : notificationUnread}</b>}
          </Link>
          {admin && (
            <Link className={`desktop-nav-link${pathname.startsWith("/admin") ? " on" : ""}`} href="/admin">
              <Icon name="admin_panel_settings" size={22} />
              <span>Admin</span>
              {adminAttention > 0 && <b className="desktop-count">{adminAttention > 9 ? "9+" : adminAttention}</b>}
            </Link>
          )}
        </nav>
        <GlobalAdd triggerClassName="desktop-create" triggerLabel="Add" />
      </aside>

    </>
  );
}
