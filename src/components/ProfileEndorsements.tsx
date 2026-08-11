"use client";

import { useState, useTransition } from "react";
import { toggleEndorsement } from "@/app/actions/endorsements";
import { Icon } from "@/components/Icon";
import { BodyPortal } from "@/components/BodyPortal";

const TRAITS = [
  ["motivating", "Strong motivator", "bolt"],
  ["welcoming", "Welcoming energy", "favorite"],
  ["clear_cues", "Clear communicator", "campaign"],
  ["form_expert", "Form expert", "verified"],
  ["makes_it_fun", "Makes it fun", "star_filled"],
  ["community_builder", "Community builder", "groups"],
  ["great_coaching", "Coach's choice", "auto_awesome"],
  ["high_energy", "High energy", "activity"],
  ["calming_presence", "Calming presence", "favorite"],
  ["creative_classes", "Creative classes", "auto_awesome"],
  ["tough_love", "The right push", "bolt"],
  ["always_prepared", "Always prepared", "event_available"],
  ["inclusive", "Everyone belongs", "groups"],
  ["great_music", "Great music", "campaign"],
  ["confidence_builder", "Builds confidence", "star_filled"],
  ["detail_oriented", "Notices the details", "fingerprint"],
  ["adaptable", "Meets you there", "explore"],
  ["authentic", "Authentically them", "verified"],
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
  const [picker, setPicker] = useState(false);
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
  const earned = TRAITS.filter(([key]) => (counts[key] ?? 0) > 0 || selected.has(key));
  const stamp = ([key, label, icon]: (typeof TRAITS)[number], index: number, compact = false) => {
    const count = counts[key] ?? 0;
    const on = selected.has(key);
    const content = (
      <>
        <span className="coach-stamp-seal"><Icon name={icon} size={compact ? 23 : 27} /></span>
        <span className="coach-stamp-label">{label}</span>
        {count ? <span className="coach-stamp-count">{count}</span> : null}
      </>
    );
    if (owner) return <span className={`coach-stamp stamp-${(index % 4) + 1} on`} key={key}>{content}</span>;
    return <button disabled={pending} aria-pressed={on} className={`coach-stamp${compact ? " compact" : ""} stamp-${(index % 4) + 1}${on ? " on" : ""}`} key={key} onClick={() => tap(key)}>{content}</button>;
  };
  return (
    <section className="profile-props profile-stamps" aria-label={`Coach stamps for ${firstName}`}>
      <div className="profile-props-copy">
        <strong>{owner ? "Coach stamps" : `Stamp ${firstName}'s profile`}</strong>
        <span>{total ? `${total} ${total === 1 ? "stamp" : "stamps"} from the people they coach` : owner ? "Your first stamp will appear here" : "Be the first to add a seal of approval"}</span>
      </div>
      <div className="profile-stamp-rail">
        {earned.map((trait) => stamp(trait, TRAITS.indexOf(trait)))}
        {!owner && (
          <button className="coach-stamp add-stamp" onClick={() => setPicker(true)}>
            <span className="coach-stamp-seal"><Icon name="add" size={28} /></span>
            <span className="coach-stamp-label">Add stamp</span>
          </button>
        )}
      </div>
      <BodyPortal>
        {picker && (
          <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) setPicker(false); }}>
            <div className="sheet stamp-picker">
              <div className="adderhead">
                <div><h2>Pick a stamp</h2><p>What makes {firstName} great?</p></div>
                <button className="iconbtn sheetclose adderclose" aria-label="Close" onClick={() => setPicker(false)}><Icon name="close" size={18} /></button>
              </div>
              <div className="stamp-picker-grid">
                {TRAITS.map((trait, index) => stamp(trait, index, true))}
              </div>
            </div>
          </div>
        )}
      </BodyPortal>
    </section>
  );
}
