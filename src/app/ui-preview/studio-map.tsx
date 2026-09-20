"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { List } from "lucide-react";
import { usePrototype } from "./prototype-state";
import styles from "./preview.module.css";

export type MapStudio = { name: string; type: string; location: string; photo?:string|null; coordinates: [number, number] | null };

export default function StudioMap({ studios, onClose }: { studios: MapStudio[]; onClose: () => void }) {
  const p=usePrototype();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const container = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<MapStudio | null>(null);
  const [failed, setFailed] = useState(false);
  const located=studios.filter(studio=>studio.coordinates);
  const active = located.find(studio => studio.name === selected?.name) ?? located[0];
  useEffect(() => {
    let disposed = false;
    let map: import("leaflet").Map | undefined;
    void import("leaflet").then(L => {
      if (disposed || !container.current) return;
      map = L.map(container.current, { scrollWheelZoom: false }).setView([40.724, -74.05], 13);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).on("tileerror", () => setFailed(true)).addTo(map);
      studios.filter(studio=>studio.coordinates).forEach((studio, index) => {
        L.marker(studio.coordinates!, {
          title: studio.name, alt: studio.name,
          icon: L.divIcon({ className: styles.studioMarker, html: `<span>${index + 1}</span>`, iconSize: [44, 44], iconAnchor: [22, 44] }),
        }).addTo(map!).on("click", () => { setSelected(studio); map?.panTo(studio.coordinates!); });
      });
      if (studios.some(s=>s.coordinates)) map.fitBounds(L.latLngBounds(studios.filter(s=>s.coordinates).map(studio => studio.coordinates!)), { paddingTopLeft: [50, 90], paddingBottomRight: [50, 280], maxZoom: 14 });
    }).catch(() => setFailed(true));
    return () => { disposed = true; map?.remove(); };
  }, [studios]);
  return <dialog ref={dialog} className={styles.mapTakeover} aria-label="Studios map view" onClose={onClose}>
    <div className={styles.studioMapWrap}>
    <div ref={container} className={styles.studioMap} aria-label="Studio map"/>
    <p className={styles.mapNote}>{p.live ? "Studio locations" : "Sample studio locations"}{failed ? " · Map tiles unavailable" : ""}</p>
    {!active && <div className={styles.mapStudioCard}>No mapped studios for this search. Go back to see the full list.</div>}
    {active && <div className={styles.mapStudioCard} aria-live="polite"><strong>{active.name}</strong><span>{active.type} · {active.location}</span><button className={styles.mapDetailLink} onClick={()=>{dialog.current?.close();p.open({kind:"studio",name:active.name});}}>View studio</button></div>}
    <button autoFocus className={styles.mapToggle} onClick={() => dialog.current?.close()}><List size={19}/>Back to list</button>
  </div></dialog>;
}
