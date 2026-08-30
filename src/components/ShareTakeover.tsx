"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadCalendarShareData, type CalendarShareData } from "@/app/actions/calendar-data";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
import { invalidateClientMemory, loadClientMemory, readClientMemory } from "@/lib/client-memory";

const ShareHubScreen = dynamic(
  () => import("@/components/ShareHubScreen").then((module) => module.ShareHubScreen),
  { loading: () => <div className="share-takeover-loading" aria-busy="true"><i aria-hidden="true" /><span>Opening your share studio…</span></div> },
);

const SHARE_CACHE_KEY = "share-takeover";

export function ShareTakeover({ onClosed }: { onClosed: () => void }) {
  const [data, setData] = useState<CalendarShareData | null>(() =>
    // The warm copy is only an immediate first frame. Every open refreshes it
    // below, so it can safely survive for the rest of this signed-in session.
    readClientMemory<CalendarShareData>(SHARE_CACHE_KEY, Number.POSITIVE_INFINITY),
  );
  const [error, setError] = useState(false);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originScroll = useRef(0);
  const dialogRef = useRef<HTMLElement>(null);
  const mountedRef = useRef(true);
  const loadRequest = useRef(0);
  const historyMarker = useRef(`share-takeover-${Math.random().toString(36).slice(2)}`);
  const historyClosePending = useRef(false);

  const finishClose = useCallback(() => {
    if (!closingRef.current) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    onClosed();
  }, [onClosed]);

  const beginClose = useCallback(() => {
    if (closingRef.current) return;
    historyClosePending.current = false;
    closingRef.current = true;
    setClosing(true);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // animationend is the normal completion path. The timeout is only a
    // safety net for WebViews that drop animation events while backgrounded.
    closeTimer.current = setTimeout(finishClose, reduced ? 0 : 700);
  }, [finishClose]);

  const close = useCallback(() => {
    if (closingRef.current || historyClosePending.current) return;
    if (window.history.state?.shareTakeover === historyMarker.current) {
      historyClosePending.current = true;
      window.history.back();
      return;
    }
    beginClose();
  }, [beginClose]);

  const load = useCallback(async (showError: boolean, force = false) => {
    const request = ++loadRequest.current;
    if (showError) setError(false);
    if (force) invalidateClientMemory(SHARE_CACHE_KEY);
    try {
      const next = await loadClientMemory(SHARE_CACHE_KEY, loadCalendarShareData);
      if (!next) throw new Error("Share data unavailable");
      if (mountedRef.current && request === loadRequest.current) setData(next);
    } catch {
      if (showError && mountedRef.current && request === loadRequest.current) setError(true);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    originScroll.current = window.scrollY;
    const backgroundState: Array<{
      element: HTMLElement;
      inert: boolean;
      ariaHidden: string | null;
    }> = [];
    let backgroundBlocked = false;
    const blockBackground = (dialog: HTMLElement) => {
      if (backgroundBlocked) return;
      backgroundBlocked = true;
      for (const element of [...document.body.children]) {
        if (!(element instanceof HTMLElement) || element.contains(dialog)) continue;
        if (["SCRIPT", "STYLE", "LINK"].includes(element.tagName)) continue;
        backgroundState.push({
          element,
          inert:element.hasAttribute("inert"),
          ariaHidden:element.getAttribute("aria-hidden"),
        });
        element.setAttribute("inert", "");
        element.setAttribute("aria-hidden", "true");
      }
    };
    window.dispatchEvent(new CustomEvent("fittlist:takeover", { detail: true }));
    window.history.pushState(
      { ...(window.history.state ?? {}), shareTakeover:historyMarker.current },
      "",
      window.location.href,
    );
    let focusFrame = 0;
    const focusWhenReady = () => {
      if (dialogRef.current) {
        dialogRef.current.focus({ preventScroll:true });
        // The origin can itself be a portaled calendar takeover. Block every
        // body sibling, not just the route shell, so screen readers and
        // keyboard users encounter only Share until it closes.
        blockBackground(dialogRef.current);
      }
      else focusFrame = requestAnimationFrame(focusWhenReady);
    };
    focusFrame = requestAnimationFrame(focusWhenReady);

    const onKeyDown = (event: KeyboardEvent) => {
      const outerScrim = dialogRef.current?.parentElement;
      const foregroundOverlays = [...document.querySelectorAll<HTMLElement>(
        ".sheet-scrim, .classoverlay, .avoverlay",
      )].filter((overlay) => (
        overlay !== outerScrim
        && overlay.getClientRects().length > 0
        && !overlay.closest("[inert]")
      ));
      const foregroundOverlay = foregroundOverlays[foregroundOverlays.length - 1];
      const focusRoot = foregroundOverlay ?? dialogRef.current;
      if (event.key === "Escape") {
        if (foregroundOverlay) {
          // Most editor sub-sheets are deliberately lightweight and do not
          // install a global keyboard listener. Close the topmost one through
          // its own control. A richer modal such as the Instagram prompt owns
          // Escape itself and falls through when it has no close control.
          const closeControl = foregroundOverlay.querySelector<HTMLButtonElement>(
            'button[aria-label="Close"], button[aria-label^="Close "]',
          );
          if (!closeControl) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          closeControl.click();
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
        return;
      }
      if (event.key !== "Tab" || !focusRoot) return;
      const focusable = [...focusRoot.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((element) => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) {
        event.preventDefault();
        focusRoot.focus({ preventScroll:true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === focusRoot || !focusRoot.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === focusRoot || active === last || !focusRoot.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    const onPopState = () => beginClose();
    window.addEventListener("popstate", onPopState);

    // A warm canvas appears immediately. Refreshing it in the background
    // keeps changed classes current without returning to a skeleton.
    void load(data === null);

    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(focusFrame);
      if (closeTimer.current) clearTimeout(closeTimer.current);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("popstate", onPopState);
      for (const state of backgroundState) {
        if (!state.inert) state.element.removeAttribute("inert");
        if (state.ariaHidden === null) state.element.removeAttribute("aria-hidden");
        else state.element.setAttribute("aria-hidden", state.ariaHidden);
      }
      if (window.history.state?.shareTakeover === historyMarker.current) {
        const nextState = { ...(window.history.state ?? {}) };
        delete nextState.shareTakeover;
        window.history.replaceState(nextState, "", window.location.href);
      }
      window.dispatchEvent(new CustomEvent("fittlist:takeover", { detail: false }));
      requestAnimationFrame(() => window.scrollTo(0, originScroll.current));
    };
  // The opening snapshot intentionally controls whether the refresh can show
  // an error. Re-running for data updates would turn one request into a loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beginClose, close, load]);

  return (
    <BodyPortal>
      <div className={`sheet-scrim calendar-share-scrim share-takeover-scrim${closing ? " is-closing" : ""}`}>
        <section
          ref={dialogRef}
          id="share-takeover"
          className={`sheet calendar-share-sheet share-takeover-sheet${closing ? " is-closing" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Share"
          tabIndex={-1}
          onAnimationEnd={(event) => {
            if (closing && event.target === event.currentTarget && event.animationName === "calendar-share-down") {
              finishClose();
            }
          }}
        >
          <header className="share-takeover-head">
            <button
              type="button"
              className="sheetclose calendar-share-close"
              aria-label="Close share editor"
              onClick={close}
            >
              <Icon name="close" size={24} />
            </button>
          </header>

          {data ? (
            <ShareHubScreen
              embedded
              coach={data.coach}
              handle={data.handle}
              items={data.items}
              defaultFrom={data.defaultFrom}
              today={data.today}
              savedHeadline={data.savedHeadline}
              hasBackground={data.hasBackground}
              studios={[]}
              templates={[]}
              customTypes={[]}
              lastUsed={{ startTime:"18:00", durationMin:60, studioId:null }}
              initialRevision={data.initialRevision}
              initialDesign={data.initialDesign}
              savedLooks={data.savedLooks}
              deferAdderData
              onRefreshWeek={() => load(false, true)}
            />
          ) : error ? (
            <div className="share-takeover-error" role="alert">
              <strong>We couldn’t open your share studio.</strong>
              <span>Check your connection and try again.</span>
              <button type="button" onClick={() => void load(true)}>Try again</button>
            </div>
          ) : (
            <div className="share-takeover-loading" aria-busy="true">
              <i aria-hidden="true" />
              <span>Opening your share studio…</span>
            </div>
          )}
        </section>
      </div>
    </BodyPortal>
  );
}
