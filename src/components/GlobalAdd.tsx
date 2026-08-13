"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { globalComposerData } from "@/app/actions/composer";
import { createStudio, findStudioMatches, type StudioMatch } from "@/app/actions/studios";
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
  const [placeMatches, setPlaceMatches] = useState<StudioMatch[]>([]);
  const [matching, setMatching] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();
  const router = useRouter();
  useEffect(() => {
    const query = placeName.trim();
    if (mode !== "place" || query.length < 2) {
      setPlaceMatches([]);
      setMatching(false);
      return;
    }
    let current = true;
    setMatching(true);
    const timer = window.setTimeout(async () => {
      try {
        const matches = await findStudioMatches(query);
        if (current) setPlaceMatches(matches);
      } finally {
        if (current) setMatching(false);
      }
    }, 220);
    return () => { current = false; window.clearTimeout(timer); };
  }, [mode, placeName]);
  const exactMatch = placeMatches.find((studio) =>
    studio.name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "") ===
    placeName.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, ""),
  );
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
    if (!result.ok) {
      if (result.duplicate) setPlaceMatches((current) =>
        current.some((studio) => studio.id === result.duplicate!.id)
          ? current
          : [result.duplicate!, ...current],
      );
      toast(result.error ?? "Something went wrong");
      return;
    }
    close();
    setPlaceName(""); setPlaceAddress(""); setPlaceKind("studio");
    toast("Place added");
    router.refresh();
  });
  const composer = open && typeof document !== "undefined" ? createPortal(
    <div className="sheet-scrim globaladd-scrim" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="sheet globaladd-sheet" role="dialog" aria-modal="true" aria-labelledby="globaladd-title">
        <button className="iconbtn sheetclose" aria-label="Close" onClick={close}><Icon name="close" size={18} /></button>
        {mode === "place" ? <><h2 id="globaladd-title">Add a studio</h2><div className="globaladd-place"><label>Name<input autoFocus autoComplete="off" value={placeName} onChange={(e) => setPlaceName(e.target.value)} placeholder="Start typing the studio name" /></label>{(matching || placeMatches.length > 0) && <div className="globaladd-matches" aria-live="polite"><span>{matching ? "Checking FittList…" : "Already on FittList"}</span>{placeMatches.map((studio) => <button key={studio.id} type="button" onClick={() => { if (studio.slug) { close(); router.push(`/s/${studio.slug}`); } }} disabled={!studio.slug}><span><b>{studio.name}</b><small>{studio.address}</small></span>{studio.slug && <em>View studio</em>}</button>)}{exactMatch && <p>This studio already exists. Open it instead of adding another copy.</p>}</div>}<label>Type<select value={placeKind} onChange={(e) => setPlaceKind(e.target.value as PlaceKind)}>{PLACE_KINDS.map((kind) => <option key={kind} value={kind}>{PLACE_KIND_LABELS[kind]}</option>)}</select></label><label>Location<input value={placeAddress} onChange={(e) => setPlaceAddress(e.target.value)} placeholder="Address or location" /></label><button className="btn si" disabled={pending || Boolean(exactMatch) || !placeName.trim() || !placeAddress.trim()} onClick={addPlace}>{pending ? "Adding…" : exactMatch ? "Already on FittList" : "Add studio"}</button></div></> : <><h2 id="globaladd-title">Add a class or studio</h2><div className="globaladd-list"><button disabled={pending} onClick={() => choose("class")}><Icon name="activity" size={23} /><b>Class</b></button><button onClick={() => choose("place")}><Icon name="place" size={23} /><b>Studio</b></button></div></>}
      </div>
      {data && mode === "class" && <Adder studios={data.studios} templates={data.templates} customTypes={data.customTypes} lastUsed={data.lastUsed} subsCount={0} firstPublish={false} personal={{ canCoach: data.canCoach, event: false }} onClose={() => setMode(null)} onToast={toast} onPublished={(msg) => { close(); toast(msg); router.refresh(); }} onDeleted={(msg) => { close(); toast(msg); router.refresh(); }} />}
    </div>,
    document.body,
  ) : null;
  return <><button className="iconbtn" aria-label="Add" onClick={() => setOpen(true)}><Icon name="add" size={24} /></button>{composer}<Toast msg={toastMsg} on={toastOn} /></>;
}
