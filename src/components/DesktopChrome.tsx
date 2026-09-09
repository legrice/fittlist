"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { GlobalAdd } from "@/components/GlobalAdd";
import { LinkPending } from "@/components/LinkPending";
import { Wordmark } from "@/components/Wordmark";
import { activeTab, type NavTab } from "@/lib/nav";
import type { ManagedCalendarDestination } from "@/lib/managed-calendars";

type DesktopPerson = {
  name: string;
  location: string | null;
  photo: string | null;
  color: string;
  initial: string;
};

/**
 * The desktop header keeps primary destinations visible and account tools
 * in a dropdown. It is absent below the desktop breakpoint:
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
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searchInput.current) searchInput.current.value = pathname === "/search" ? new URLSearchParams(window.location.search).get("q") ?? "" : "";
  }, [pathname]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  // Safari can blur the trigger with no relatedTarget before a menu link
  // receives its click. Close on outside pointer, Escape or navigation instead.
  const calendarRef = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setCalendarOpen(false); setProfileOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!profileOpen) return;
    const outside = (event: PointerEvent) => { if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setProfileOpen(false); profileButton.current?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [profileOpen]);

  useEffect(() => {
    if (!calendarOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!calendarRef.current?.contains(event.target as Node)) setCalendarOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setCalendarOpen(false); calendarRef.current?.querySelector<HTMLButtonElement>("button")?.focus(); }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [calendarOpen]);

  const managedHref = (calendar: ManagedCalendarDestination) =>
    calendar.kind === "studio" ? `/s/${calendar.slug}/manage` : `/g/${calendar.slug}/manage`;
  const managedActive = managedCalendars.some((calendar) => pathname.startsWith(managedHref(calendar)));
  const personalOn = pathname === "/calendar";
  const followingOn = pathname === "/feed" || pathname.startsWith("/calendar/following");
  const calendarOn = personalOn || managedActive;
  const showCalendarAdd = personalOn || followingOn || managedCalendars.some(calendar => pathname === (calendar.kind === "studio" ? `/s/${calendar.slug}/manage/calendar` : `/g/${calendar.slug}`));
  const profileOn = pathname.startsWith(profileHref) || pathname.startsWith("/settings") ||
    (active === "calendar" && !pathname.startsWith("/calendar"));
  return (
    <>
      <header className="desktop-left desktop-top-header" aria-label="Desktop navigation">
        <Link className="desktop-logo" href="/calendar" aria-label="FittList calendar">
          <Wordmark variant="ink" />
        </Link>
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
              onClick={() => { setCalendarOpen((open) => !open); setProfileOpen(false); }}
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
                {(["studio", "group"] as const).map(kind => <div key={kind} role="group" aria-label={kind === "studio" ? "Studios" : "Groups"}>
                {managedCalendars.some(calendar => calendar.kind === kind) && <p role="presentation">{kind === "studio" ? "Studios" : "Groups"}</p>}
                {managedCalendars.filter(calendar => calendar.kind === kind).map((calendar) => {
                  const href = managedHref(calendar);
                  const selected = pathname.startsWith(href);
                  return (
                    <Link href={href} role="menuitem" className={selected ? "selected" : ""} onClick={() => setCalendarOpen(false)} key={`${calendar.kind}:${calendar.id}`}>
                      <span className={`desktop-calendar-menu-icon ${calendar.kind}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {calendar.photo ? <img src={calendar.photo} alt="" /> : <Icon name={calendar.kind === "studio" ? "storefront" : "groups"} size={19} />}
                      </span>
                      <span><strong>{calendar.name}</strong><small>{calendar.kind === "studio" ? "Studio admin center" : "Group admin center"}</small></span>
                      {selected && <Icon name="check" size={18} />}
                    </Link>
                  );
                })}</div>)}
              </div>
            )}
          </div>
          <Link className={`desktop-nav-link${followingOn ? " on" : ""}`} href="/calendar/following" aria-current={followingOn ? "page" : undefined}>
            <Icon name="calendar_view_day" size={22} /><span>Following</span><LinkPending className="desktop-nav-spin" />
          </Link>
          <Link className={`desktop-nav-link${here === "discover" ? " on" : ""}`} href="/discover" aria-current={here === "discover" ? "page" : undefined}>Discover<LinkPending className="desktop-nav-spin" /></Link>
        </nav>
        <form className="desktop-header-search" action="/search" role="search">
          <Icon name="search" size={20} />
          <input ref={searchInput} type="search" name="q" aria-label="Search FittList" placeholder="Search FittList" minLength={2} required />
          <button type="submit" aria-label="Search"><Icon name="arrow_forward" size={18} /></button>
        </form>
        <div className="desktop-header-tools">
          <Link className={`desktop-nav-link${pathname.startsWith("/inbox") ? " on" : ""}`} href="/inbox" aria-label="Messages" title="Messages" aria-current={pathname.startsWith("/inbox") ? "page" : undefined}>
            <Icon name="chat_bubble" size={22} />
            <span className="desktop-tool-label">Messages</span>
            <LinkPending className="desktop-nav-spin" />
            {messageUnread > 0 && <b className="desktop-count desktop-unread-count" aria-label={`${messageUnread} unread messages`}>{messageUnread > 99 ? "99+" : messageUnread}</b>}
          </Link>
          <Link className={`desktop-nav-link${pathname.startsWith("/notifications") ? " on" : ""}`} href="/notifications" aria-label="Notifications" title="Notifications" aria-current={pathname.startsWith("/notifications") ? "page" : undefined}>
            <Icon name="notifications" size={22} />
            <span className="desktop-tool-label">Notifications</span>
            <LinkPending className="desktop-nav-spin" />
            {notificationUnread > 0 && <b className="desktop-count desktop-unread-count" aria-label={`${notificationUnread} unread notifications`}>{notificationUnread > 99 ? "99+" : notificationUnread}</b>}
          </Link>
          <div className="desktop-account" ref={profileRef}>
            <button ref={profileButton} type="button" className={`desktop-profile-link${profileOn ? " on" : ""}`} aria-label="Profile menu" aria-expanded={profileOpen} aria-controls="desktop-account-menu" onClick={() => { setProfileOpen(open => !open); setCalendarOpen(false); }}>
              {person.photo ? <img src={person.photo} alt="" /> : <span className="desktop-profile-avatar-empty" style={{ background: person.color }}>{person.initial}</span>}
              {admin && (adminAttention > 0 || adminActivity > 0) && <i className="desktop-account-dot" aria-label="Admin activity" />}
            </button>
            {profileOpen && <div id="desktop-account-menu" className="desktop-account-menu">
              <p>{person.name}</p>
              <Link href={profileHref}><Icon name="person" size={20} />Your profile</Link>
              <Link href="/settings"><Icon name="settings" size={20} />Settings</Link>
              <Link href={coach ? "/coachshare" : "/membershare"}><Icon name="reply" size={20} />Share</Link>
              {admin && <>
                <Link href="/admin"><Icon name="admin_panel_settings" size={20} />Admin{adminAttention > 0 && <b className="desktop-count">{adminAttention > 9 ? "9+" : adminAttention}</b>}</Link>
                <Link href="/admin?activity=1"><Icon name="activity" size={20} />Product activity{adminActivity > 0 && <b className="desktop-count">New</b>}</Link>
              </>}
            </div>}
          </div>
        </div>
      </header>
      {showCalendarAdd && <GlobalAdd triggerClassName="desktop-add-fab" triggerLabel="Add" triggerIconSize={24} />}
    </>
  );
}
