"use client";

import { useState, useTransition } from "react";
import { toggleStudioVisit } from "@/app/actions/endorsements";
import { Icon } from "@/components/Icon";
import { SignupPrompt } from "@/components/SignupPrompt";

export function StudioBeenHere({ slug, initial, initialCount }: {
  slug: string;
  initial: boolean;
  initialCount: number;
}) {
  const [selected, setSelected] = useState(initial);
  const [count, setCount] = useState(initialCount);
  const [pending, start] = useTransition();
  const [signup, setSignup] = useState(false);

  const toggle = () => start(async () => {
    const result = await toggleStudioVisit(slug);
    if (result.signedOut) {
      setSignup(true);
      return;
    }
    if (!result.ok || result.selected === undefined) return;
    setSelected(result.selected);
    setCount((current) => Math.max(0, current + (result.selected ? 1 : -1)));
  });

  return (
    <>
    <button
      type="button"
      className={`actpill studio-been-here${selected ? " on" : ""}`}
      aria-pressed={selected}
      disabled={pending}
      onClick={toggle}
    >
      <Icon name={selected ? "favorite_filled" : "favorite"} size={18} />
      {selected ? "Saved" : "Save calendar"}
      {count > 0 && <span className="studio-been-count">{count}</span>}
    </button>
    <SignupPrompt
      open={signup}
      onClose={() => setSignup(false)}
      next={`/s/${slug}`}
      title="Save this calendar"
      body="Sign up to save this gym or studio schedule and find it anytime."
    />
    </>
  );
}
