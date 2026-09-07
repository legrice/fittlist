"use client";

import { LoadingDots } from "@/components/LoadingDots";


import { useEffect, useRef, useState } from "react";
import { settingsSheetData, type SettingsSheetData } from "@/app/actions/settings";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
import { MemberAccount } from "@/components/MemberAccount";
import { ProfileSheet } from "@/components/ProfileSheet";
import { withTimeout } from "@/lib/async";
import { invalidateClientMemory, loadClientMemory, readClientMemory } from "@/lib/client-memory";
import type { ProfileSettingsView } from "@/components/YouDashboard";

type DirectSettingsView = ProfileSettingsView | "away";

/** Opens one settings section over the surface that requested it. */
export function SettingsDetailSheet({ view, onClose }: { view: DirectSettingsView | "home"; onClose: () => void }) {
  const [data, setData] = useState<SettingsSheetData | null>(() => readClientMemory("settings-sheet"));
  const memberView=view === "home" ? null : view === "page" ? "profile" : view === "away" ? "account" : view;

  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    let current = true;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setFailed(false);
    void loadClientMemory("settings-sheet", () => withTimeout(settingsSheetData())).then((next) => {
      if (!current) return;
      if (next) setData(next);
      else setFailed(true);
    }).catch(() => { if (current) setFailed(true); });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    const refresh = () => { invalidateClientMemory("settings-sheet"); setAttempt(value => value + 1); };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("fittlist:settings-changed", refresh);
    return () => {
      current = false;
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("fittlist:settings-changed", refresh);
    };
  }, [attempt]);

  const loading = <div className="header-account-loading">{failed ? <>
    <p role="alert">Couldn’t load settings. Check your connection and try again.</p>
    <button type="button" className="btn" onClick={() => { invalidateClientMemory("settings-sheet"); setAttempt(value => value + 1); }}>Try again</button>
  </> : <p><LoadingDots label="Opening settings…"/></p>}</div>;

  if (view !== "home") {
    return <BodyPortal>{data ? data.kind === "coach" ? <ProfileSheet {...data.coach} anim="none" detailOnly initialView={view} onClose={onClose} /> : <MemberAccount {...data.fan} detailOnly initialView={memberView} onClose={onClose} /> : <div className="header-account-overlay" onMouseDown={onClose}><section className="header-account-sheet header-profile-sheet" role="dialog" aria-modal="true" aria-label="Opening settings" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="iconbtn header-profile-close sheet-dismiss" aria-label="Close" onClick={onClose}><Icon name="close" size={20} /></button>{loading}</section></div>}</BodyPortal>;
  }

  return <BodyPortal><div className="header-account-overlay" onMouseDown={onClose}>
    <section className={`header-account-sheet header-profile-sheet${view === "home" ? " settings-index-sheet" : ""}`} role="dialog" aria-modal="true" aria-label={view === "home" ? "Settings" : "Calendar and sync"} onMouseDown={(event) => event.stopPropagation()}>
      {data ? data.kind === "coach" ? <ProfileSheet {...data.coach} anim="none" detailOnly={view !== "home"} initialView={view} onClose={onClose} /> : <MemberAccount {...data.fan} detailOnly={view !== "home"} initialView={memberView} onClose={onClose} /> : <><button type="button" className="iconbtn header-profile-close sheet-dismiss" aria-label="Close" onClick={onClose}><Icon name="close" size={20} /></button>{loading}</>}
    </section>
  </div></BodyPortal>;
}
