"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

// A lightweight tag editor: type an item, Enter/comma (or Add) to append it as
// a removable chip. Used for certifications and "What to Expect".
export function ChipsField({
  value,
  onChange,
  placeholder,
  maxLen = 40,
  max = 12,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  maxLen?: number;
  max?: number;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const v = draft.trim().replace(/\s+/g, " ").slice(0, maxLen);
    setDraft("");
    if (!v || value.length >= max) return;
    if (value.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    onChange([...value, v]);
  };

  return (
    <div className="chipsfield">
      {/* The field first and the tags under it, by Matt's call: the input
          stays where the finger left it, and what you have added reads as a
          result rather than a wall in front of the box. */}
      {value.length < max && (
        <div className="chipsfield-row">
          <input
            className="editinput"
            value={draft}
            placeholder={placeholder}
            maxLength={maxLen}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" className="chipsfield-add" onClick={add} disabled={!draft.trim()}>
            Add
          </button>
        </div>
      )}
      {value.length > 0 && (
        <div className="chipsfield-list">
          {value.map((c, i) => (
            <span key={`${c}-${i}`} className="chipsfield-chip">
              {c}
              <button type="button" aria-label={`Remove ${c}`} onClick={() => onChange(value.filter((_, idx) => idx !== i))}>
                <Icon name="close" size={15} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
