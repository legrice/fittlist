"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLook } from "@/app/actions/profile";
import { DARK_ENABLED } from "@/lib/darkmode";
import { Icon } from "@/components/Icon";
import { applyThemeMode } from "@/components/ThemeModeSync";

// The viewer's look is stored on their account and follows them across the
// app. The document flips immediately; the refreshed server root is the
// persisted truth.
export function DarkModeToggle({ initialOn }: { initialOn: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initialOn);
  const [pending, startTransition] = useTransition();
  useEffect(() => setOn(initialOn), [initialOn]);
  // While the look is off, the row goes with it. A switch that stays on
  // screen and changes nothing is worse than no switch: it reads as broken
  // rather than as withdrawn, and somebody would flip it twice to be sure.
  // The stored preference is untouched, so turning DARK_ENABLED back on
  // brings both the row and everyone's old choice back.
  if (!DARK_ENABLED) return null;

  const toggle = () => {
    if (pending) return;
    const next = !on;
    setOn(next);
    applyThemeMode(next);
    startTransition(async () => {
      try {
        const result = await setLook(next ? "dark" : "light");
        if (result.ok) {
          router.refresh();
          return;
        }
      } catch {
        // The optimistic switch is rolled back below. A later visit still
        // reads the stored server value, so a failed request cannot leave the
        // rest of the app disagreeing with Settings.
      }
      setOn(!next);
      applyThemeMode(!next);
    });
  };

  return (
    <button type="button" className="setrow" onClick={toggle} aria-pressed={on} disabled={pending}>
      <span className="setrow-ic"><Icon name={on ? "dark_mode" : "light_mode"} size={24} /></span>
      <span className="setrow-txt">
        <span className="t">Dark mode</span>
        <span className="s">{on ? "On across FittList" : "Off across FittList"}</span>
      </span>
      <span className={`switch${on ? " on" : ""}`} aria-hidden="true">
        <span className="switch-knob" />
      </span>
    </button>
  );
}
