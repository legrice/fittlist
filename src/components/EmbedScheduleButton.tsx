"use client";

import { useEffect, useMemo, useState } from "react";
import { embedStudioOptions } from "@/app/actions/embed";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

export function EmbedScheduleButton({ handle, inline = false }: { handle: string; inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const [studios, setStudios] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();
  const origin = typeof window === "undefined" ? "https://fittlist.co" : window.location.origin;
  const embedUrl = useMemo(() => {
    const url = new URL(`/embed/${handle}`, origin);
    for (const studioId of selected) url.searchParams.append("studio", studioId);
    return url.toString();
  }, [handle, origin, selected]);
  const code = `<iframe src="${embedUrl}" title="${handle}'s FittList schedule" width="100%" height="720" style="border:0;border-radius:16px" loading="lazy"></iframe>`;

  useEffect(() => {
    if ((!inline && !open) || studios.length || loading) return;
    setLoading(true);
    void embedStudioOptions().then(setStudios).finally(() => setLoading(false));
  }, [inline, loading, open, studios.length]);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    toast("Embed code copied");
  };

  const setup = (
    <div className="embed-setup">
      <p>Embed the public classes you teach. Include every studio, or choose only the places you want on this schedule.</p>
      <div className="embed-studio-options" role="group" aria-label="Studios to include">
        <button type="button" className={selected.length === 0 ? "on" : ""} onClick={() => setSelected([])}>
          <Icon name={selected.length === 0 ? "check_circle" : "circle"} size={21} />
          <span><strong>All studios</strong><small>Every public class you teach</small></span>
        </button>
        {loading && <p>Loading your studios…</p>}
        {studios.map((studio) => {
          const on = selected.includes(studio.id);
          return <button type="button" className={on ? "on" : ""} onClick={() => setSelected((current) => on ? current.filter((id) => id !== studio.id) : [...current, studio.id])} key={studio.id}>
            <Icon name={on ? "check_circle" : "circle"} size={21} />
            <span><strong>{studio.name}</strong><small>Classes you teach here</small></span>
          </button>;
        })}
      </div>
      <textarea readOnly value={code} aria-label="Schedule embed code" rows={6} onFocus={(event) => event.currentTarget.select()} />
      <button className="btn primary" type="button" onClick={copy}><Icon name="content_copy" size={18} /> Copy embed code</button>
    </div>
  );

  if (inline) return <>{setup}<Toast msg={toastMsg} on={toastOn} /></>;

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
            {setup}
          </section>
        </div>
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
