"use client";

import { LoadingDots } from "@/components/LoadingDots";


import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { youAccountData } from "@/app/actions/you";
import { settingsSheetData, type SettingsSheetData } from "@/app/actions/settings";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
import { YouDashboard, type ProfileSettingsView, type YouAccountData } from "@/components/YouDashboard";
import { loadClientMemory, readClientMemory, writeClientMemory } from "@/lib/client-memory";

const ProfileSheet = dynamic(() => import("@/components/ProfileSheet").then((module) => module.ProfileSheet));
const MemberAccount = dynamic(() => import("@/components/MemberAccount").then((module) => module.MemberAccount));

type HeaderFace = { photo: string | null; color: string; initial: string };

export function HeaderAccountButton({
  face,
  unread = false,
  fallbackHref = "/you",
  initialData,
}: {
  face?: HeaderFace;
  unread?: boolean;
  fallbackHref?: string;
  initialData?: YouAccountData;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<YouAccountData | null>(() => initialData ?? readClientMemory("you-dashboard"));
  const [settingsData, setSettingsData] = useState<SettingsSheetData | null>(() => readClientMemory("settings-sheet"));
  const [settingsView, setSettingsView] = useState<ProfileSettingsView | null>(null);
  const dashboardRequest = useRef<Promise<YouAccountData | null> | null>(null);
  const dashboardLoaded = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (data) writeClientMemory("you-dashboard", data);
  }, [data]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", escape);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const loadDashboard = useCallback(async () => {
    if (dashboardLoaded.current) return data;
    if (!dashboardRequest.current) {
      dashboardRequest.current = loadClientMemory("you-dashboard", youAccountData)
        .then((next) => {
          if (next) setData(next);
          dashboardLoaded.current = true;
          return next;
        })
        .catch(() => null)
        .finally(() => { dashboardRequest.current = null; });
    }
    return dashboardRequest.current;
  }, [data]);

  const show = async () => {
    setOpen(true);
    if (data) {
      void loadDashboard();
      return;
    }
    const next = await loadDashboard();
    if (next) return;
    setOpen(false);
    router.push(fallbackHref);
  };
  const openSettings = async (view: ProfileSettingsView) => {
    setSettingsView(view);
    if (settingsData) {
      void loadClientMemory("settings-sheet", settingsSheetData).then((next) => {
        if (next) setSettingsData(next);
      });
      return;
    }
    try {
      const next = await loadClientMemory("settings-sheet", settingsSheetData);
      if (next) setSettingsData(next);
      else setSettingsView(null);
    } catch {
      setSettingsView(null);
      router.push("/settings");
    }
  };
  const close = () => {
    setOpen(false);
    setSettingsView(null);
  };

  return (
    <>
      <button
        type="button"
        className="brandbar-avatar"
        aria-label={`Open your profile${unread ? ", new activity" : ""}`}
        aria-expanded={open}
        onClick={show}
        onPointerEnter={() => { void loadDashboard(); }}
        onFocus={() => { void loadDashboard(); }}
      >
        {face?.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={face.photo} alt="" />
        ) : (
          <span style={{ background: face?.color ?? "var(--color-surface-muted)" }}>{face?.initial ?? "?"}</span>
        )}
        {unread && <i aria-hidden="true" />}
      </button>

      {open && (
        <BodyPortal>
          <div className="header-account-overlay" onMouseDown={close}>
            <section
              className="header-account-sheet header-profile-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Your profile"
              onMouseDown={(event) => event.stopPropagation()}
              onClickCapture={(event) => {
                if ((event.target as HTMLElement).closest("a")) close();
              }}
            >
              <button type="button" className="iconbtn header-profile-close sheet-dismiss" aria-label="Close" onClick={close}>
                <Icon name="close" size={20} />
              </button>
              {settingsView ? (
                  settingsData ? settingsData.kind === "coach" ? (
                    <ProfileSheet
                      {...settingsData.coach}
                      anim="none"
                      detailOnly
                      initialView={settingsView}
                      onClose={() => setSettingsView(null)}
                    />
                  ) : (
                    <MemberAccount
                      {...settingsData.fan}
                      detailOnly
                      initialView={settingsView === "page" ? "profile" : settingsView}
                      onClose={() => setSettingsView(null)}
                    />
                  ) : <div className="header-account-loading"><p><LoadingDots label="Opening settings…"/></p></div>
                ) : data ? (
                  <YouDashboard {...data} onOpenSettings={openSettings} />
              ) : (
                <div className="header-account-loading"><p><LoadingDots label="Opening your profile…"/></p></div>
              )}
            </section>
          </div>
        </BodyPortal>
      )}
    </>
  );
}
