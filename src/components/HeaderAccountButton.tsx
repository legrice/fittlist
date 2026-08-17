"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { youDashboardData } from "@/app/actions/you";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
import { YouDashboard, type YouDashboardData } from "@/components/YouDashboard";

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
  const [data, setData] = useState<YouDashboardData | null>(null);
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
      const next = await youDashboardData();
      if (next) {
        setData(next);
        return;
      }
    } catch {
      // The standalone profile remains the resilient fallback.
    }
    setOpen(false);
    router.push(fallbackHref);
  };
  const close = () => {
    setOpen(false);
    setData(null);
  };

  return (
    <>
      <button
        type="button"
        className="brandbar-avatar"
        aria-label={`Open your profile${unread ? ", new activity" : ""}`}
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
              className="header-account-sheet header-profile-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Your profile"
              onMouseDown={(event) => event.stopPropagation()}
              onClickCapture={(event) => {
                if ((event.target as HTMLElement).closest("a")) close();
              }}
            >
              <div className="header-account-grabber" aria-hidden="true" />
              <button type="button" className="iconbtn header-profile-close" aria-label="Close" onClick={close}>
                <Icon name="close" size={20} />
              </button>
              {data ? (
                <YouDashboard {...data} />
              ) : (
                <div className="header-account-loading"><p>Opening your profile&hellip;</p></div>
              )}
            </section>
          </div>
        </BodyPortal>
      )}
    </>
  );
}
