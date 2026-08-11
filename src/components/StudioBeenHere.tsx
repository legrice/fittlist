"use client";

import { useState, useTransition } from "react";
import { toggleStudioVisit } from "@/app/actions/endorsements";
import { Icon } from "@/components/Icon";

export function StudioBeenHere({ slug, initial, initialCount }: {
  slug: string;
  initial: boolean;
  initialCount: number;
}) {
  const [selected, setSelected] = useState(initial);
  const [count, setCount] = useState(initialCount);
  const [pending, start] = useTransition();

  const toggle = () => start(async () => {
    const result = await toggleStudioVisit(slug);
    if (result.signedOut) {
      window.location.href = `/?next=${encodeURIComponent(`/s/${slug}`)}`;
      return;
    }
    if (!result.ok || result.selected === undefined) return;
    setSelected(result.selected);
    setCount((current) => Math.max(0, current + (result.selected ? 1 : -1)));
  });

  return (
    <button
      type="button"
      className={`actpill studio-been-here${selected ? " on" : ""}`}
      aria-pressed={selected}
      disabled={pending}
      onClick={toggle}
    >
      <Icon name={selected ? "check" : "place"} size={18} />
      {selected ? "Been here" : "I’ve been here"}
      {count > 0 && <span className="studio-been-count">{count}</span>}
    </button>
  );
}
