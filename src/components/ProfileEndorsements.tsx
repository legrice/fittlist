"use client";

import { useState, useTransition } from "react";
import { toggleEndorsement } from "@/app/actions/endorsements";
import { Icon } from "@/components/Icon";

const TRAITS = [
  ["motivating", "Strong motivator", "bolt"],
  ["welcoming", "Welcoming energy", "favorite"],
  ["clear_cues", "Clear communicator", "campaign"],
  ["form_expert", "Form expert", "verified"],
  ["makes_it_fun", "Makes it fun", "star_filled"],
  ["community_builder", "Community builder", "groups"],
  ["great_coaching", "Coach's choice", "auto_awesome"],
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
    <section className="profile-props profile-stamps" aria-label={`Coach stamps for ${firstName}`}>
      <div className="profile-props-copy">
        <strong>{owner ? "Coach stamps" : `Stamp ${firstName}'s profile`}</strong>
        <span>{total ? `${total} ${total === 1 ? "stamp" : "stamps"} from the people they coach` : "Add a seal of approval for what makes them great"}</span>
      </div>
      <div className="profile-stamp-rail">
        {TRAITS.map(([key, label, icon], index) => {
          const count = counts[key] ?? 0;
          if (owner && !count) return null;
          return owner ? (
            <span className={`coach-stamp stamp-${(index % 4) + 1} on`} key={key}>
              <span className="coach-stamp-seal"><Icon name={icon} size={27} /></span>
              <span className="coach-stamp-label">{label}</span>
              {count ? <span className="coach-stamp-count">{count}</span> : null}
            </span>
          ) : (
            <button disabled={pending} aria-pressed={selected.has(key)} className={`coach-stamp stamp-${(index % 4) + 1}${selected.has(key) ? " on" : ""}`} key={key} onClick={() => tap(key)}>
              <span className="coach-stamp-seal"><Icon name={icon} size={27} /></span>
              <span className="coach-stamp-label">{label}</span>
              {count ? <span className="coach-stamp-count">{count}</span> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
