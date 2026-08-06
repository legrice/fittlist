"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { STUDIO_TYPES } from "@/lib/studio";

// One vocabulary for what a place offers and what a person teaches.
//
// The studio editor had this list first; a coach picking "Yoga" means the same
// word as a studio offering it, so they share the list rather than growing a
// second one that drifts. That's what makes a single filter in Discover find
// both halves of the directory.
/** The same vocabulary as a dropdown, for a form where forty chips is a wall:
 *  the field opens a scrolling list, picks collect as removable tags under
 *  it, and the menu stays up so several can be taken in one visit. */
export function TypeMultiSelect({
  value,
  onChange,
  max,
  placeholder = "Pick from the list",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (t: string) => {
    if (value.includes(t)) {
      onChange(value.filter((x) => x !== t));
      return;
    }
    if (max && value.length >= max) return;
    onChange([...value, t]);
  };
  return (
    <div className="msel">
      <button
        type="button"
        className="msel-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={value.length ? undefined : "msel-ph"}>
          {value.length ? `${value.length} picked${max ? ` of ${max}` : ""}` : placeholder}
        </span>
        <Icon name={open ? "expand_less" : "expand_more"} size={20} />
      </button>
      {open && (
        <>
          {/* Click-away, under the menu: tapping anywhere else closes it. */}
          <button
            type="button"
            className="msel-away"
            aria-label="Close the list"
            onClick={() => setOpen(false)}
          />
          <div className="msel-menu" role="listbox" aria-multiselectable="true">
            {STUDIO_TYPES.map((t) => {
              const on = value.includes(t);
              const full = !on && !!max && value.length >= max;
              return (
                <button
                  key={t}
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={`msel-opt${on ? " on" : ""}`}
                  disabled={full}
                  onClick={() => toggle(t)}
                >
                  <span>{t}</span>
                  {on && <Icon name="check" size={17} />}
                </button>
              );
            })}
          </div>
        </>
      )}
      {/* The picks, as tags under the field: below, never above, so the
          field stays where the finger left it. */}
      {value.length > 0 && (
        <div className="chipsfield-list msel-chips">
          {value.map((t) => (
            <span key={t} className="chipsfield-chip">
              {t}
              <button
                type="button"
                aria-label={`Remove ${t}`}
                onClick={() => onChange(value.filter((x) => x !== t))}
              >
                <Icon name="close" size={15} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function TypePicker({
  value,
  onChange,
  max,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  /** A cap, where picking everything would say nothing. */
  max?: number;
}) {
  const toggle = (t: string) => {
    if (value.includes(t)) {
      onChange(value.filter((x) => x !== t));
      return;
    }
    if (max && value.length >= max) return;
    onChange([...value, t]);
  };
  return (
    <div className="typepick">
      {STUDIO_TYPES.map((t) => {
        const on = value.includes(t);
        return (
          <button
            key={t}
            type="button"
            className={`chip${on ? " sel" : ""}`}
            aria-pressed={on}
            disabled={!on && !!max && value.length >= max}
            onClick={() => toggle(t)}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}
