"use client";

import { useEffect } from "react";

// While any overlay is on screen — a bottom sheet, the class overlay, the
// avatar zoom — freeze the background so it can't scroll behind it. Background
// scrolling was breaking sticky save buttons, making sheet forms hard to edit,
// and letting the list wander under an open class. A MutationObserver toggles
// a body class so every overlay across the app is covered from one place; the
// overlays that need to scroll do it inside their own layer.
export function ScrollLock() {
  useEffect(() => {
    const update = () => {
      const open = document.querySelector(".sheet-scrim, .classoverlay, .avoverlay") !== null;
      document.body.classList.toggle("sheet-open", open);
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    update();
    return () => {
      observer.disconnect();
      document.body.classList.remove("sheet-open");
    };
  }, []);
  return null;
}
