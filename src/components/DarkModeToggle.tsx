"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

// A personal dark-mode switch for the coach app. State lives in localStorage and
// is mirrored onto <html data-mode> (an inline script in the layout applies it
// before paint, so there's no flash). Rendered only for the accounts allowed to
// see it — see ProfileSheet.
export function DarkModeToggle() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(document.documentElement.getAttribute("data-mode") === "dark");
  }, []);

  const toggle = () => {
    const next = !on;
    setOn(next);
    const root = document.documentElement;
    if (next) root.setAttribute("data-mode", "dark");
    else root.removeAttribute("data-mode");
    try {
      localStorage.setItem("fl-dark", next ? "1" : "0");
    } catch {
      /* private mode — the attribute still applies for this session */
    }
  };

  return (
    <button className="setrow" onClick={toggle} aria-pressed={on}>
      <span className="setrow-ic"><Icon name={on ? "dark_mode" : "light_mode"} size={22} /></span>
      <span className="setrow-txt">
        <span className="t">Dark mode</span>
        <span className="s">{on ? "On" : "Off"}</span>
      </span>
      <span className={`switch${on ? " on" : ""}`} aria-hidden="true">
        <span className="switch-knob" />
      </span>
    </button>
  );
}
