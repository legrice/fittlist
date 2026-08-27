"use client";

import { useMemo } from "react";

const FALLBACK_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const title = (zone: string) => zone.replaceAll("_", " ").replace("/", " · ");

export function TimeZoneSelect({
  id = "timeZone",
  value,
  onChange,
  label = "Time zone",
}: {
  id?: string;
  value: string;
  onChange: (timeZone: string) => void;
  label?: string;
}) {
  const zones = useMemo(() => {
    const intl = Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] };
    const available = intl.supportedValuesOf?.("timeZone") ?? FALLBACK_ZONES;
    return [...new Set([value, ...available])].filter(Boolean);
  }, [value]);

  return (
    <>
      <label className="flabel" htmlFor={id}>{label}</label>
      <select
        id={id}
        className="editinput"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {zones.map((zone) => <option key={zone} value={zone}>{title(zone)}</option>)}
      </select>
    </>
  );
}
