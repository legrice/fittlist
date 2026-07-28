"use client";

import { useEffect, useId, useState } from "react";
import { knownLocations } from "@/app/actions/locations";

// A location field that offers the cities already in use.
//
// Discover groups by the exact string, so the cost of someone typing their own
// spelling is a second pill for a place that already has one. A native
// datalist is the cheapest fix that works the same on iOS, Android and
// desktop: start typing "Jersey" and the Jersey City, NJ everyone else is in
// is right there to pick.
export function LocationInput({
  id,
  value,
  onChange,
  placeholder = "Jersey City, NJ",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const listId = useId();
  const [known, setKnown] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    knownLocations()
      .then((l) => live && setKnown(l))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  return (
    <>
      <input
        id={id}
        className="editinput"
        list={known.length ? listId : undefined}
        autoComplete="off"
        maxLength={80}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {known.length > 0 && (
        <datalist id={listId}>
          {known.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      )}
    </>
  );
}
