"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

export function EmbedScheduleButton({ handle }: { handle: string }) {
  const [open, setOpen] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();
  const origin = typeof window === "undefined" ? "https://fittlist.co" : window.location.origin;
  const code = `<iframe src="${origin}/embed/${handle}" title="${handle}'s FittList schedule" width="100%" height="720" style="border:0;border-radius:16px" loading="lazy"></iframe>`;

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    toast("Embed code copied");
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        <Icon name="link" size={18} />
        <span>Embed</span>
      </button>
      {open && (
        <div className="sheet-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="sheet embed-sheet" role="dialog" aria-modal="true" aria-label="Embed your schedule">
            <button className="sheetclose" type="button" aria-label="Close" onClick={() => setOpen(false)}><Icon name="close" size={22} /></button>
            <h2>Embed your schedule</h2>
            <p>Paste this code into your website. Your public classes update automatically when your FittList calendar changes.</p>
            <textarea readOnly value={code} aria-label="Schedule embed code" rows={6} onFocus={(event) => event.currentTarget.select()} />
            <button className="btn primary" type="button" onClick={copy}><Icon name="content_copy" size={18} /> Copy embed code</button>
          </section>
        </div>
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
