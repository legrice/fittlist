"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { settingsSheetData, type SettingsSheetData } from "@/app/actions/settings";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
import { loadClientMemory, readClientMemory } from "@/lib/client-memory";
import type { ProfileSettingsView } from "@/components/YouDashboard";

const ProfileSheet = dynamic(() => import("@/components/ProfileSheet").then((module) => module.ProfileSheet));
const MemberAccount = dynamic(() => import("@/components/MemberAccount").then((module) => module.MemberAccount));

/** Opens one settings section over the surface that requested it. */
export function SettingsDetailSheet({ view, onClose }: { view: ProfileSettingsView; onClose: () => void }) {
  const [data, setData] = useState<SettingsSheetData | null>(() => readClientMemory("settings-sheet"));

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

  return <BodyPortal><div className="header-account-overlay" onMouseDown={onClose}>
    <section className="header-account-sheet header-profile-sheet" role="dialog" aria-modal="true" aria-label="Calendar and sync" onMouseDown={(event) => event.stopPropagation()}>
      {data ? data.kind === "coach" ? <ProfileSheet {...data.coach} anim="none" detailOnly initialView={view} onClose={onClose} /> : <MemberAccount {...data.fan} detailOnly initialView={view === "page" ? "profile" : view} onClose={onClose} /> : <><button type="button" className="iconbtn header-profile-close" aria-label="Close" onClick={onClose}><Icon name="close" size={20} /></button><div className="header-account-loading"><p>Opening calendar settings&hellip;</p></div></>}
    </section>
  </div></BodyPortal>;
}
