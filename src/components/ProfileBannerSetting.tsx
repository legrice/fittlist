"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadProfileBanner, saveProfileBanner } from "@/app/actions/profile-banner";
import { readPhoto } from "@/lib/photo";
import { withTimeout } from "@/lib/async";
import { LoadingDots } from "@/components/LoadingDots";
import { Icon } from "@/components/Icon";
import { BodyPortal } from "@/components/BodyPortal";

export function ProfileBannerSetting({ studioId, groupId, compact = false }: { studioId?: string; groupId?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const close = () => { if (!busy) { setOpen(false); trigger.current?.focus(); } };
  useEffect(() => {
    if (!open) return;
    let active = true;
    setReady(false); setChanged(false); setError("");
    void withTimeout(loadProfileBanner(studioId, groupId)).then(value => {
      if (!active) return;
      if (!value) { setError("This profile is not available to edit."); return; }
      setPhoto(value.banner); setReady(true);
    }).catch(() => { if (active) setError("Couldn’t load the banner. Close and try again."); });
    closeButton.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { active = false; document.body.style.overflow = previous; };
  }, [open, studioId, groupId]);
  const save = async () => {
    setBusy(true); setError("");
    try {
      const result = await saveProfileBanner(photo, studioId, groupId);
      if (!result.ok) { setError(result.error || "Couldn’t save the banner."); return; }
      setOpen(false); trigger.current?.focus(); router.refresh();
    } catch { setError("Couldn’t save the banner. Please try again."); }
    finally { setBusy(false); }
  };
  return <>
    <button ref={trigger} type="button" className={compact ? "profile-banner-edit" : "setrow"} onClick={() => setOpen(true)} aria-label={compact ? "Edit profile banner" : undefined}>
      {compact ? <Icon name="edit" size={20} /> : <><span className="setrow-ic"><Icon name="image" size={24} /></span><span className="setrow-txt"><span className="t">Profile banner</span><span className="s">Change the cover image behind your profile photo</span></span><span className="setrow-chev"><Icon name="chevron_right" size={22}/></span></>}
    </button>
    {open && <BodyPortal><div className="sheet-scrim profile-banner-scrim" onClick={event => { if (event.target === event.currentTarget) close(); }}><section className="sheet profile-banner-sheet" role="dialog" aria-modal="true" aria-label="Profile banner" onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); close(); }
      if (event.key === "Tab") {
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <button ref={closeButton} type="button" className="sheetclose sheet-dismiss" onClick={close} disabled={busy} aria-label="Close banner settings"><Icon name="close" size={20}/></button>
      <h2>Profile banner</h2><p>Choose a wide image. Your profile photo stays separate.</p>
      <div className="profile-banner-preview">{photo ? <img src={photo} alt="Banner preview"/> : <span>No banner image</span>}</div>
      <input ref={input} type="file" accept="image/*" hidden onChange={event => {
        const file = event.target.files?.[0]; event.currentTarget.value = ""; if (!file) return;
        setBusy(true); setError(""); readPhoto(file, image => { setPhoto(image); setChanged(true); setBusy(false); }, () => { setError("That photo couldn’t be read."); setBusy(false); });
      }}/>
      {error && <p role="alert">{error}</p>}
      {!ready && !error && <LoadingDots label="Loading banner"/>}
      <div className="profile-banner-controls"><button type="button" className="ghost" disabled={!ready || busy} onClick={() => input.current?.click()}>Choose image</button><button type="button" className="ghost" disabled={!ready || busy || !photo} onClick={() => { setPhoto(null); setChanged(true); }}>Remove image</button><button type="button" className="btn" disabled={!ready || busy || !changed} onClick={() => void save()}>{busy ? <LoadingDots label="Saving banner"/> : "Save banner"}</button></div>
    </section></div></BodyPortal>}
  </>;
}
