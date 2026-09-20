"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import styles from "./preview.module.css";

export type MapStudio = { name: string; type: string; location: string; coordinates: [number, number] };

export default function StudioMap({ studios }: { studios: MapStudio[] }) {
  const container = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<MapStudio | null>(null);
  const [failed, setFailed] = useState(false);
  const active = studios.find(studio => studio.name === selected?.name) ?? studios[0];
  useEffect(() => {
    let disposed = false;
    let map: import("leaflet").Map | undefined;
    void import("leaflet").then(L => {
      if (disposed || !container.current) return;
      map = L.map(container.current, { scrollWheelZoom: false }).setView([40.724, -74.05], 13);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).on("tileerror", () => setFailed(true)).addTo(map);
      studios.forEach((studio, index) => {
        L.marker(studio.coordinates, {
          title: studio.name, alt: studio.name,
          icon: L.divIcon({ className: styles.studioMarker, html: `<span>${index + 1}</span>`, iconSize: [44, 44], iconAnchor: [22, 44] }),
        }).addTo(map!).on("click", () => { setSelected(studio); map?.panTo(studio.coordinates); });
      });
      if (studios.length) map.fitBounds(L.latLngBounds(studios.map(studio => studio.coordinates)), { padding: [50, 60], maxZoom: 14 });
    }).catch(() => setFailed(true));
    return () => { disposed = true; map?.remove(); };
  }, [studios]);
  return <div className={styles.studioMapWrap}>
    <div ref={container} className={styles.studioMap} aria-label="Studio map"/>
    <p className={styles.mapNote}>Sample studio locations{failed ? " · Map tiles unavailable" : ""}</p>
    {active && <div className={styles.mapStudioCard} aria-live="polite"><strong>{active.name}</strong><span>{active.type} · {active.location}</span><small>Tap a numbered pin to explore a studio.</small></div>}
  </div>;
}
