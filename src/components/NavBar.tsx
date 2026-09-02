"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Icon } from "@/components/Icon";
import { LinkPending } from "@/components/LinkPending";
import { preloadShareEditor, ShareTakeover } from "@/components/ShareTakeover";
import { activeTab, navTabs, type NavTab } from "@/lib/nav";
import { sharePerformance } from "@/lib/share-performance";

export type { NavTab };

// Home, Calendar, and Search live in one thumb-reach dock. Sharing is the
// distinct action beside it, while still opening the persistent share canvas.
export function NavBar({
  active,
  coach = true,
  scheduleHref,
  profileHref,
  unread = false,
  profileFace,
}: {
  /** Omit inside the tabs layout: the pathname already says where you are.
   *  A screen off the tabs that belongs to one passes it. */
  active?: NavTab;
  /** Which calendar the Schedule tab points at. */
  coach?: boolean;
  /** Where Schedule goes; defaults by role. */
  scheduleHref?: string;
  /** Where Profile goes: your own page. Defaults to /you, which redirects. */
  profileHref?: string;
  unread?: boolean;
  profileFace?: { photo: string | null; color: string; initial: string };
}) {
  const pathname = usePathname();
  const here = activeTab(pathname, active);
  const tabs = useMemo(() => navTabs(coach, scheduleHref, profileHref), [coach, scheduleHref, profileHref]);
  const dockTabs = tabs.filter((tab) => tab.id !== "share");
  const shareTab = tabs.find((tab) => tab.id === "share")!;
  const activeDockIndex = dockTabs.findIndex((tab) => tab.id === here);
  const [shareOpen, setShareOpen] = useState(false);
  const shareButton = useRef<HTMLButtonElement>(null);
  const shareOpener = useRef<HTMLElement | null>(null);
  const restoreShareFocus = useRef(false);
  const shareOpenRef = useRef(false);

  const openShare = useCallback((opener?: HTMLElement | null) => {
    if (shareOpenRef.current) return;
    // Start the clock in the input handler, before React schedules the
    // takeover. Preloading here also covers programmatic open events that had
    // no preceding hover or focus opportunity.
    sharePerformance.navigationStarted();
    void preloadShareEditor();
    shareOpenRef.current = true;
    const activeElement = document.activeElement;
    shareOpener.current = opener
      ?? (activeElement instanceof HTMLElement && activeElement !== document.body ? activeElement : shareButton.current);
    setShareOpen(true);
  }, []);
  const openShareEvent = useCallback((event: Event) => {
    const detail = (event as CustomEvent<{ opener?: HTMLElement }>).detail;
    openShare(detail?.opener);
  }, [openShare]);
  const finishClose = useCallback(() => {
    // The takeover restores inert/aria-hidden during its passive cleanup.
    // Wait for that unmount to commit before focusing the exact opener.
    restoreShareFocus.current = true;
    shareOpenRef.current = false;
    setShareOpen(false);
  }, []);

  useEffect(() => {
    if (shareOpen || !restoreShareFocus.current) return;
    const frame = requestAnimationFrame(() => {
      const target = shareOpener.current?.isConnected ? shareOpener.current : shareButton.current;
      target?.focus();
      shareOpener.current = null;
      restoreShareFocus.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [shareOpen]);

  useEffect(() => {
    window.addEventListener("fittlist:open-share", openShareEvent);
    return () => window.removeEventListener("fittlist:open-share", openShareEvent);
  }, [openShareEvent]);

  useEffect(() => {
    // Share is a primary workflow. Warm its code and minimum calendar payload
    // after the current screen has painted, never on the navigation's critical
    // path. Safari does not expose requestIdleCallback, so give it a quiet
    // timeout instead.
    const idleWindow = window as typeof window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (typeof idleWindow.requestIdleCallback === "function") {
      const idle = idleWindow.requestIdleCallback(() => void preloadShareEditor(), { timeout:2500 });
      return () => idleWindow.cancelIdleCallback?.(idle);
    }
    const timer = setTimeout(() => void preloadShareEditor(), 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <nav className="navwrap" aria-label="Main">
      <div className="navbar">
        <span
          className={`navglass-indicator${activeDockIndex < 0 ? " is-hidden" : ""}`}
          style={{ "--nav-index": Math.max(0, activeDockIndex) } as CSSProperties}
          aria-hidden="true"
        />
        {dockTabs.map((t) => {
          const on = here === t.id;
          const cls = `navtab${on ? " on" : ""}`;
          const inner = (
            <>
              <span className="navglyph">
                <Icon name={t.icon} className={t.id === "share" ? "share-arrow-forward" : undefined} size={30} />
              </span>
              {t.id !== "following" && <span className="navlabel">{t.label}</span>}
            </>
          );
          return (
            <Link key={t.id} className={cls} data-tab={t.id} href={t.href} aria-label={t.label} aria-current={on ? "page" : undefined}>
              {inner}
              <LinkPending className="tapspin-tab" />
            </Link>
          );
        })}
      </div>
      <button
        ref={shareButton}
        type="button"
        className={`navshare${here === "share" || shareOpen ? " on" : ""}`}
        data-tab={shareTab.id}
        aria-label={shareTab.label}
        aria-current={here === "share" ? "page" : undefined}
        aria-haspopup={here === "share" ? undefined : "dialog"}
        aria-controls={here === "share" ? undefined : "share-takeover"}
        aria-expanded={here === "share" ? undefined : shareOpen}
        onPointerEnter={() => {
          if (here !== "share") void preloadShareEditor();
        }}
        onPointerDown={() => {
          if (here !== "share") void preloadShareEditor();
        }}
        onFocus={() => {
          if (here !== "share") void preloadShareEditor();
        }}
        onClick={() => {
          // Legacy direct Share URLs still render the same studio. Treat an
          // already-active action like any current tab instead of stacking a
          // second editor over it.
          if (here !== "share") openShare(shareButton.current);
        }}
      >
        <Icon name={shareTab.icon} className="share-arrow-forward" size={30} />
      </button>
      {shareOpen && <ShareTakeover onClosed={finishClose} />}
    </nav>
  );
}
