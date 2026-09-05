"use client";

import { useState } from "react";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
import { STUDIO_TYPES } from "@/lib/studio";

// One vocabulary for what a place offers and what a person teaches.
//
// The studio editor had this list first; a coach picking "Yoga" means the same
// word as a studio offering it, so they share the list rather than growing a
// second one that drifts. That's what makes a single filter in Discover find
// both halves of the directory.
/** The same vocabulary behind a field, for a form where forty chips is a
 *  wall: the field pulls up a bottom sheet of options (an in-flow dropdown
 *  was tried and only sort of worked inside a scrolling editor), picks
 *  collect as removable tags under the field, and the sheet stays up so
 *  several can be taken in one visit. Portaled, because the editor it lives
 *  in is its own stacking context. */
export function TypeMultiSelect({
  value,
  onChange,
  max,
  placeholder = "Pick from the list",
  title = "Pick from the list",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  placeholder?: string;
  /** The sheet's own heading. */
  title?: string;
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
        <BodyPortal>
          <div
            className="sheet-scrim"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div className="sheet mselsheet">
              <button
                className="iconbtn sheetclose sheet-dismiss"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <Icon name="close" size={20} />
              </button>
              <h2>{title}</h2>
              {max ? (
                <p className="lead">
                  {value.length ? `${value.length} of ${max} picked.` : `Up to ${max}.`}
                </p>
              ) : null}
              <div className="msel-list" role="listbox" aria-multiselectable="true">
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
              <div className="publishwrap">
                <button type="button" className="btn si" onClick={() => setOpen(false)}>
                  Done
                </button>
              </div>
            </div>
          </div>
        </BodyPortal>
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
