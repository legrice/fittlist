"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { HeaderAccountButton } from "@/components/HeaderAccountButton";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Wordmark";
import type { NavTab } from "@/lib/nav";
import type { YouAccountData } from "@/components/YouDashboard";

type HeaderFace = { photo: string | null; color: string; initial: string };

// The same compact header on every signed-in screen: wordmark left and the
// viewer's account. Navigation and discovery live in the bottom bar. New messages and notifications collapse
// into one activity dot on the avatar instead of competing with the calendar.
export function AppHeader({
  notificationUnread = 0,
  messageUnread = 0,
  home = "/calendar",
  nav,
  settings = false,
  admin = false,
  adminAttention = 0,
  adminActivity = 0,
  face,
  profileHref = "/you",
  accountData,
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
  /** New privacy-safe product activity since the admin last looked. */
  adminActivity?: number;
  face?: HeaderFace;
  profileHref?: string;
  accountData?: YouAccountData;
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
      <div className="brandbar-actions">
        {admin && (
          <Link
            className="header-admin-activity"
            href="/admin?activity=1"
            aria-label={`${adminActivity} new product activity ${adminActivity === 1 ? "event" : "events"}`}
          >
            <Icon name="bolt_filled" size={20} />
            {adminActivity > 0 && <b>{adminActivity > 99 ? "99+" : adminActivity}</b>}
          </Link>
        )}
        <Link className="header-search-trigger" href="/discover" aria-label="Discover people, studios, groups, and classes">
          <Icon name="search" size={21} />
        </Link>
        <HeaderAccountButton
          face={face}
          unread={notificationUnread > 0 || messageUnread > 0}
          fallbackHref={profileHref}
          initialData={accountData}
        />
      </div>
    </div>
  );
}
