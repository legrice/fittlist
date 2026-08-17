"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { settingsSheetData, type SettingsSheetData } from "@/app/actions/settings";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
import { MemberAccount } from "@/components/MemberAccount";
import { ProfileSheet } from "@/components/ProfileSheet";

type HeaderFace = { photo: string | null; color: string; initial: string };

export function HeaderAccountButton({
  face,
  unread = false,
  fallbackHref = "/you",
}: {
  face?: HeaderFace;
  unread?: boolean;
  fallbackHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SettingsSheetData | null>(null);
  const router = useRouter();

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

  const show = async () => {
    setOpen(true);
    try {
      const next = await settingsSheetData();
      if (next) {
        setData(next);
        return;
      }
    } catch {
      // The full account route is the resilient fallback if the sheet cannot load.
    }
    setOpen(false);
    router.push(fallbackHref);
  };
  const close = () => {
    setOpen(false);
    setData(null);
    router.refresh();
  };

  return (
    <>
      <button
        type="button"
        className="brandbar-avatar"
        aria-label={`Open your account${unread ? ", new activity" : ""}`}
        aria-expanded={open}
        onClick={show}
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
              className="header-account-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Your account"
              onMouseDown={(event) => event.stopPropagation()}
              onClickCapture={(event) => {
                if ((event.target as HTMLElement).closest("a")) close();
              }}
            >
              <div className="header-account-grabber" aria-hidden="true" />
              {!data ? (
                <div className="header-account-loading">
                  <button type="button" className="iconbtn acctclose" aria-label="Close" onClick={close}>
                    <Icon name="close" size={20} />
                  </button>
                  <p>Opening your account&hellip;</p>
                </div>
              ) : data.kind === "coach" ? (
                <ProfileSheet {...data.coach} anim="none" onClose={close} />
              ) : (
                <div className="acctwrap">
                  <div className="accttop">
                    <h1 className="acct-h">Your account</h1>
                    <button type="button" className="iconbtn acctclose" aria-label="Close" onClick={close}>
                      <Icon name="close" size={20} />
                    </button>
                  </div>
                  <MemberAccount {...data.fan} />
                </div>
              )}
            </section>
          </div>
        </BodyPortal>
      )}
    </>
  );
}
