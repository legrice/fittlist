"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

export type ProfileLink = { label: string; url: string };

// Editor for the extra labelled links on the public page: a list of added
// links with remove buttons, plus label + URL inputs to append the next one.
export function LinksField({
  value,
  onChange,
  max = 6,
}: {
  value: ProfileLink[];
  onChange: (v: ProfileLink[]) => void;
  max?: number;
}) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  const add = () => {
    const u = url.trim();
    if (!u || value.length >= max) return;
    const fallback = u.replace(/^https?:\/\//i, "").split("/")[0];
    onChange([...value, { label: label.trim().slice(0, 24) || fallback, url: u }]);
    setLabel("");
    setUrl("");
  };

  return (
    <div className="linksfield">
      {value.map((l, i) => (
        <div key={`${l.url}-${i}`} className="linksfield-row">
          <span className="linksfield-txt">
            <span className="nm">{l.label}</span>
            <span className="u">{l.url}</span>
          </span>
          <button
            type="button"
            className="linksfield-x"
            aria-label={`Remove ${l.label}`}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
      {value.length < max && (
        <>
          <input
            className="editinput"
            type="text"
            maxLength={24}
            placeholder="Label (e.g. Book a session)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <input
            className="editinput"
            style={{ marginTop: 8 }}
            type="url"
            autoCapitalize="none"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" className="linksfield-add" disabled={!url.trim()} onClick={add}>
            + Add link
          </button>
        </>
      )}
    </div>
  );
}
