"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// The action row on a class page: "Add to calendar" (Google link or an .ics
// download that Apple Calendar / Outlook import) and a Share button that opens
// the native share sheet, falling back to copying the class link.
export function EventActions({
  googleUrl,
  icsHref,
  shareUrl,
  shareTitle,
}: {
  googleUrl: string;
  icsHref: string;
  shareUrl: string;
  shareTitle: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuOpen]);

  const share = async () => {
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: shareTitle, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      toast("Link copied");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast("Link copied");
      } catch {
        toast(shareUrl);
      }
    }
  };

  return (
    <div className="evactions">
      <div className="evcal" ref={wrapRef}>
        <button
          className="btn ghost evactbtn"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <Icon name="calendar_month" size={18} className="evact-ico" />
          Add to calendar
        </button>
        {menuOpen && (
          <div className="evcalmenu" role="menu">
            <a
              className="evcalitem"
              role="menuitem"
              href={googleUrl}
              target="_blank"
              rel="noopener nofollow"
              onClick={() => setMenuOpen(false)}
            >
              Google Calendar
            </a>
            <a
              className="evcalitem"
              role="menuitem"
              href={icsHref}
              onClick={() => setMenuOpen(false)}
            >
              Apple or Outlook
            </a>
          </div>
        )}
      </div>
      <button className="btn ghost evactbtn evshare" aria-label="Share this class" onClick={share}>
        <Icon name="ios_share" size={18} className="evact-ico" />
        Share
      </button>
      <Toast msg={toastMsg} on={toastOn} />
    </div>
  );
}
