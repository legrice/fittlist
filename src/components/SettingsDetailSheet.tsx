"use client";

import { useEffect, useState } from "react";
import { settingsSheetData, type SettingsSheetData } from "@/app/actions/settings";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
import { MemberAccount } from "@/components/MemberAccount";
import { ProfileSheet } from "@/components/ProfileSheet";
import { loadClientMemory, readClientMemory } from "@/lib/client-memory";
import type { ProfileSettingsView } from "@/components/YouDashboard";

type DirectSettingsView = ProfileSettingsView | "away";

/** Opens one settings section over the surface that requested it. */
export function SettingsDetailSheet({ view, onClose }: { view: DirectSettingsView | "home"; onClose: () => void }) {
  const [data, setData] = useState<SettingsSheetData | null>(() => readClientMemory("settings-sheet"));
  const memberView=view === "home" ? null : view === "page" ? "profile" : view === "away" ? "account" : view;

  useEffect(() => {
    let current = true;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    void loadClientMemory("settings-sheet", settingsSheetData).then((next) => {
      if (current && next) setData(next);
    });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      current = false;
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  if (view !== "home") {
    return <BodyPortal>{data ? data.kind === "coach" ? <ProfileSheet {...data.coach} anim="none" detailOnly initialView={view} onClose={onClose} /> : <MemberAccount {...data.fan} detailOnly initialView={memberView} onClose={onClose} /> : <div className="header-account-overlay" onMouseDown={onClose}><section className="header-account-sheet header-profile-sheet" role="dialog" aria-modal="true" aria-label="Opening settings" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="iconbtn header-profile-close" aria-label="Close" onClick={onClose}><Icon name="close" size={20} /></button><div className="header-account-loading"><p>Opening settings&hellip;</p></div></section></div>}</BodyPortal>;
  }

  return <BodyPortal><div className="header-account-overlay" onMouseDown={onClose}>
    <section className={`header-account-sheet header-profile-sheet${view === "home" ? " settings-index-sheet" : ""}`} role="dialog" aria-modal="true" aria-label={view === "home" ? "Settings" : "Calendar and sync"} onMouseDown={(event) => event.stopPropagation()}>
      {data ? data.kind === "coach" ? <ProfileSheet {...data.coach} anim="none" detailOnly={view !== "home"} initialView={view} onClose={onClose} /> : <MemberAccount {...data.fan} detailOnly={view !== "home"} initialView={memberView} onClose={onClose} /> : <><button type="button" className="iconbtn header-profile-close" aria-label="Close" onClick={onClose}><Icon name="close" size={20} /></button><div className="header-account-loading"><p>Opening settings&hellip;</p></div></>}
    </section>
  </div></BodyPortal>;
}
