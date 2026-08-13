"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { globalComposerData } from "@/app/actions/composer";
import { createStudio } from "@/app/actions/studios";
import { Adder } from "@/components/Adder";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";
import { PLACE_KIND_LABELS, PLACE_KINDS, type PlaceKind } from "@/lib/studio";
import type { LastUsed, StudioDto, TemplateDto } from "@/lib/types";

type ComposerData = { studios: StudioDto[]; templates: TemplateDto[]; customTypes: string[]; lastUsed: LastUsed; canCoach: boolean };

export function GlobalAdd() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<null | "class" | "place">(null);
  const [data, setData] = useState<ComposerData | null>(null);
  const [pending, startTransition] = useTransition();
  const [placeName, setPlaceName] = useState("");
  const [placeAddress, setPlaceAddress] = useState("");
  const [placeKind, setPlaceKind] = useState<PlaceKind>("studio");
  const [toastMsg, toastOn, toast] = useToast();
  const router = useRouter();
  const close = () => { setOpen(false); setMode(null); };
  const choose = (next: "class" | "place") => {
    if (next === "place") { setMode(next); return; }
    startTransition(async () => {
      const loaded = data ?? await globalComposerData();
      if (!loaded) { toast("Sign in to add to FittList"); return; }
      setData(loaded);
      setMode(next);
    });
  };
  const addPlace = () => startTransition(async () => {
    const result = await createStudio(placeName, placeAddress, placeKind);
    if (!result.ok) { toast(result.error ?? "Something went wrong"); return; }
    close();
    setPlaceName(""); setPlaceAddress(""); setPlaceKind("studio");
    toast("Place added");
    router.refresh();
  });
  const composer = open && typeof document !== "undefined" ? createPortal(
    <div className="sheet-scrim globaladd-scrim" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="sheet globaladd-sheet" role="dialog" aria-modal="true" aria-labelledby="globaladd-title">
        <button className="iconbtn sheetclose" aria-label="Close" onClick={close}><Icon name="close" size={18} /></button>
        {mode === "place" ? <><h2 id="globaladd-title">Add a studio</h2><div className="globaladd-place"><label>Type<select value={placeKind} onChange={(e) => setPlaceKind(e.target.value as PlaceKind)}>{PLACE_KINDS.map((kind) => <option key={kind} value={kind}>{PLACE_KIND_LABELS[kind]}</option>)}</select></label><label>Name<input value={placeName} onChange={(e) => setPlaceName(e.target.value)} placeholder="Studio name" /></label><label>Location<input value={placeAddress} onChange={(e) => setPlaceAddress(e.target.value)} placeholder="Address or location" /></label><button className="btn si" disabled={pending || !placeName.trim() || !placeAddress.trim()} onClick={addPlace}>{pending ? "Adding…" : "Add studio"}</button></div></> : <><h2 id="globaladd-title">Add a class or studio</h2><div className="globaladd-list"><button disabled={pending} onClick={() => choose("class")}><Icon name="activity" size={23} /><b>Class</b></button><button onClick={() => choose("place")}><Icon name="place" size={23} /><b>Studio</b></button></div></>}
      </div>
      {data && mode === "class" && <Adder studios={data.studios} templates={data.templates} customTypes={data.customTypes} lastUsed={data.lastUsed} subsCount={0} firstPublish={false} personal={{ canCoach: data.canCoach, event: false }} onClose={() => setMode(null)} onToast={toast} onPublished={(msg) => { close(); toast(msg); router.refresh(); }} onDeleted={(msg) => { close(); toast(msg); router.refresh(); }} />}
    </div>,
    document.body,
  ) : null;
  return <><button className="iconbtn" aria-label="Add" onClick={() => setOpen(true)}><Icon name="add" size={24} /></button>{composer}<Toast msg={toastMsg} on={toastOn} /></>;
}
