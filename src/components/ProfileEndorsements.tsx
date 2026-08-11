"use client";

import { useState, useTransition } from "react";
import { toggleEndorsement } from "@/app/actions/endorsements";

const TRAITS = [
  ["great_coaching", "Great coaching"],
  ["welcoming", "Welcoming"],
  ["motivating", "Motivating"],
  ["clear_cues", "Clear cues"],
] as const;

export function ProfileEndorsements({ handle, firstName, initial, mine, owner }: {
  handle: string;
  firstName: string;
  initial: Record<string, number>;
  mine: string[];
  owner: boolean;
}) {
  const [selected, setSelected] = useState(new Set(mine));
  const [counts, setCounts] = useState(initial);
  const [pending, start] = useTransition();
  const tap = (key: string) => start(async () => {
    const was = selected.has(key);
    const result = await toggleEndorsement(handle, key);
    if (result.signedOut) {
      window.location.href = `/?next=/${handle}`;
      return;
    }
    if (!result.ok) return;
    setSelected((old) => {
      const next = new Set(old);
      if (was) next.delete(key); else next.add(key);
      return next;
    });
    setCounts((old) => ({ ...old, [key]: Math.max(0, (old[key] ?? 0) + (was ? -1 : 1)) }));
  });
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return (
    <section className="profile-props" aria-label={`Endorsements for ${firstName}`}>
      <div className="profile-props-copy">
        <strong>{owner ? "What people appreciate" : `Give props to ${firstName}`}</strong>
        <span>{total ? `${total} positive ${total === 1 ? "endorsement" : "endorsements"}` : "Celebrate what makes their coaching great"}</span>
      </div>
      <div className="profile-props-pills">
        {TRAITS.map(([key, label]) => {
          const count = counts[key] ?? 0;
          if (owner && !count) return null;
          return owner ? (
            <span className="prop-pill on" key={key}>{label}{count ? ` · ${count}` : ""}</span>
          ) : (
            <button disabled={pending} className={`prop-pill${selected.has(key) ? " on" : ""}`} key={key} onClick={() => tap(key)}>
              {label}{count ? ` · ${count}` : ""}
            </button>
          );
        })}
      </div>
    </section>
  );
}
