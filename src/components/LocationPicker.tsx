"use client";

import { useEffect, useRef, useState } from "react";
import { placeLabel, rankOpenMeteoHits, type GeoPlace, type OpenMeteoHit } from "@/lib/geocode";

// The official location picker, by Matt's call: a city typed is a string,
// a city picked is a place with coordinates, and coordinates are what let
// "coaches near you" mean something. Suggestions come from Open-Meteo's
// geocoder (free, keyless, city-level) as you type; tapping one stores the
// canonical "City, ST" label and its point. Typing after a pick clears the
// point, because the words no longer describe it.
//
// Deliberately not a hard gate: offline, or with the geocoder down, the
// typed text still saves and the server takes its own best-effort shot at
// coordinates. A signup that cannot finish because a third party is having
// a bad day is worse than a profile without a point.
export function LocationPicker({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (value: string, place: GeoPlace | null) => void;
}) {
  const [hits, setHits] = useState<GeoPlace[]>([]);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Debounced lookup; only the newest response may paint, or a slow "mont"
  // lands after "montclair" and the list goes backwards while you type.
  useEffect(() => {
    const query = value.trim();
    const name = query.split(",")[0].trim();
    if (name.length < 2) {
      setHits([]);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=en&format=json`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          results?: OpenMeteoHit[];
        };
        if (mine !== seq.current) return;
        setHits(
          rankOpenMeteoHits(data.results ?? [], query).slice(0, 5).map((r) => ({
            label: placeLabel(r),
            lat: r.latitude,
            lng: r.longitude,
            timeZone: r.timezone,
          })),
        );
      } catch {
        /* offline or blocked: the typed text still saves */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);

  return (
    <div className="locpick" ref={wrapRef}>
      <input
        id={id}
        className="editinput"
        value={value}
        placeholder="Montclair, NJ"
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          // Typed words are just words until one is picked.
          onChange(e.target.value, null);
          setOpen(true);
        }}
      />
      {open && hits.length > 0 && (
        <div className="locpick-list" role="listbox">
          {hits.map((h) => (
            <button
              key={`${h.label}-${h.lat}`}
              type="button"
              role="option"
              aria-selected="false"
              className="locpick-row"
              onClick={() => {
                onChange(h.label, h);
                setOpen(false);
              }}
            >
              {h.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
