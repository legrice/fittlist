"use client";

import { useEffect } from "react";

// While any bottom sheet (.sheet-scrim) is on screen, freeze the background so
// it can't scroll behind the sheet — background scrolling was breaking sticky
// save buttons and making sheet forms hard to edit. A MutationObserver toggles
// a body class so every sheet across the app is covered from one place.
export function ScrollLock() {
  useEffect(() => {
    const update = () => {
      const open = document.querySelector(".sheet-scrim") !== null;
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
