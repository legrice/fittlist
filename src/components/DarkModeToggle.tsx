"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLook } from "@/app/actions/profile";
import { DARK_ENABLED } from "@/lib/darkmode";
import { Icon } from "@/components/Icon";

// The coach's page look. Stored on their account: it themes the whole app AND
// their public page for every visitor. The <html> attribute flips immediately
// for feedback; the server attribute (rendered per page root) is the truth.
export function DarkModeToggle({ initialOn }: { initialOn: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initialOn);
  const [, startTransition] = useTransition();
  // While the look is off, the row goes with it. A switch that stays on
  // screen and changes nothing is worse than no switch: it reads as broken
  // rather than as withdrawn, and somebody would flip it twice to be sure.
  // The stored preference is untouched, so turning DARK_ENABLED back on
  // brings both the row and everyone's old choice back.
  if (!DARK_ENABLED) return null;

  const toggle = () => {
    const next = !on;
    setOn(next);
    const root = document.documentElement;
    if (next) root.setAttribute("data-mode", "dark");
    else root.removeAttribute("data-mode");
    startTransition(async () => {
      await setLook(next ? "dark" : "light");
      router.refresh();
    });
  };

  return (
    <button className="setrow" onClick={toggle} aria-pressed={on}>
      <span className="setrow-ic"><Icon name={on ? "dark_mode" : "light_mode"} size={24} /></span>
      <span className="setrow-txt">
        <span className="t">Dark mode</span>
        <span className="s">{on ? "On for your page and app" : "Off"}</span>
      </span>
      <span className={`switch${on ? " on" : ""}`} aria-hidden="true">
        <span className="switch-knob" />
      </span>
    </button>
  );
}
