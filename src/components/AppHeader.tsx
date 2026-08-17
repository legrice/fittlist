"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { HeaderAccountButton } from "@/components/HeaderAccountButton";
import { HeaderNav } from "@/components/HeaderNav";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Wordmark";
import type { NavTab } from "@/lib/nav";

type HeaderFace = { photo: string | null; color: string; initial: string };

// The same compact header on every signed-in screen: wordmark left, then
// search and the viewer's account. New messages and notifications collapse
// into one activity dot on the avatar instead of competing with the calendar.
export function AppHeader({
  notificationUnread = 0,
  messageUnread = 0,
  home = "/calendar",
  nav,
  settings = false,
  admin = false,
  adminAttention = 0,
  face,
  profileHref = "/you",
}: {
  notificationUnread?: number;
  messageUnread?: number;
  /** Where the wordmark goes. The calendar is the signed-in front door. */
  home?: string;
  /** The tabs, as links in the middle of the header, on a screen too wide for
   *  a bottom bar. Pass it wherever the bottom bar renders and omit it where
   *  it doesn't, so the two agree about whether this screen has tabs at all. */
  nav?: { coach?: boolean; active?: NavTab; scheduleHref?: string; profileHref?: string };
  /** Settings is contextual to your own profile rather than global chrome. */
  settings?: boolean;
  /** Site operations are visible only to configured admins. */
  admin?: boolean;
  /** Number of unresolved reported listings. */
  adminAttention?: number;
  face?: HeaderFace;
  profileHref?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [search, setSearch] = useState("");

  if (pathname === "/search") {
    const updateSearch = (value: string) => {
      setSearch(value);
      window.dispatchEvent(new CustomEvent("fittlist:search-query", { detail: value }));
    };
    return (
      <div className="brandbar brandbar-searching">
        <button
          type="button"
          className="header-search-back"
          aria-label="Back"
          onClick={() => {
            if (window.history.length > 1) router.back();
            else router.push(home);
          }}
        >
          <Icon name="arrow_back" size={24} />
        </button>
        <div className="header-search-field">
          <Icon name="search" size={21} />
          <input
            className="header-search-input"
            value={search}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder="Search FittList"
            aria-label="Search FittList"
            autoFocus
          />
          {search && (
            <button type="button" aria-label="Clear search" onClick={() => updateSearch("")}>
              <Icon name="close" size={18} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="brandbar">
      <Link className="brandbar-home" href={home} aria-label="Home">
        <Wordmark variant="ink" />
      </Link>
      {nav && (
        <HeaderNav
          coach={nav.coach}
          active={nav.active}
          scheduleHref={nav.scheduleHref}
          profileHref={nav.profileHref}
        />
      )}
      <div className="brandbar-actions">
        <Link className="iconbtn inboxbtn" href="/search" aria-label="Search">
          <Icon name="search" size={23} />
        </Link>
        <HeaderAccountButton
          face={face}
          unread={notificationUnread > 0 || messageUnread > 0}
          fallbackHref={profileHref}
        />
      </div>
    </div>
  );
}
