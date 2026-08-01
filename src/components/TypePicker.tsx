"use client";

import { STUDIO_TYPES } from "@/lib/studio";

// One vocabulary for what a place offers and what a person teaches.
//
// The studio editor had this list first; a coach picking "Yoga" means the same
// word as a studio offering it, so they share the list rather than growing a
// second one that drifts. That's what makes a single filter in Discover find
// both halves of the directory.
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
