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
    let frame = 0;
    let activeDialog: HTMLElement | null = null;
    const returnFocus = new Map<HTMLElement, HTMLElement | null>();
    const inerted = new Map<HTMLElement, boolean>();
    const focusable = (dialog: HTMLElement) => [...dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )].filter((element) => element.tabIndex >= 0 && element.getClientRects().length && !element.closest("[inert], [hidden], [aria-hidden=true]"));
    const restoreInert = () => {
      inerted.forEach((value, element) => { element.inert = value; });
      inerted.clear();
    };
    const update = () => {
      const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"], .sheet-scrim > .sheet, .classoverlay, .avoverlay')]
        .filter((element) => element.getClientRects().length);
      const dialog = dialogs.at(-1) ?? null;
      const open = !!dialog || document.querySelector(".sheet-scrim") !== null;
      document.body.classList.toggle("sheet-open", open);
      if (dialog === activeDialog) return;
      restoreInert();
      const previous = activeDialog;
      activeDialog = dialog;
      if (previous && !dialogs.includes(previous)) {
        const target = returnFocus.get(previous);
        if (target?.isConnected && (!dialog || dialog.contains(target))) target.focus({ preventScroll: true });
        returnFocus.delete(previous);
      }
      if (!dialog) return;
      if (!returnFocus.has(dialog)) returnFocus.set(dialog, document.activeElement instanceof HTMLElement ? document.activeElement : null);
      // Isolate siblings at every level, including nested sheets rendered in
      // the same portal. Remember pre-existing inert state when restoring.
      for (let branch: HTMLElement = dialog; branch.parentElement; branch = branch.parentElement) {
        for (const sibling of branch.parentElement.children) {
          if (!(sibling instanceof HTMLElement) || sibling === branch || sibling.matches('[role="status"], [aria-live], script, style')) continue;
          inerted.set(sibling, sibling.inert);
          sibling.inert = true;
        }
        if (branch.parentElement === document.body) break;
      }
      if (!dialog.contains(document.activeElement)) {
        if (!dialog.hasAttribute("tabindex")) dialog.tabIndex = -1;
        (focusable(dialog)[0] ?? dialog).focus({ preventScroll: true });
      }
    };
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !activeDialog) return;
      const elements = focusable(activeDialog);
      // Safari's default Tab preference skips buttons and can send focus to
      // browser chrome before reaching our last control. Traverse the dialog's
      // complete keyboard order explicitly on all engines.
      const index = elements.indexOf(document.activeElement as HTMLElement);
      const next = index < 0 ? (event.shiftKey ? elements.length - 1 : 0)
        : (index + (event.shiftKey ? -1 : 1) + elements.length) % elements.length;
      event.preventDefault();
      (elements[next] ?? activeDialog).focus({ preventScroll: true });
    };
    document.addEventListener("keydown", trapFocus, true);
    // A sheet can add dozens of descendants in one render. Observing the body
    // used to run a full-document query for every one of those mutations.
    // Coalesce a render's mutations into one check per animation frame.
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", trapFocus, true);
      restoreInert();
      if (frame) cancelAnimationFrame(frame);
      document.body.classList.remove("sheet-open");
    };
  }, []);
  return null;
}
