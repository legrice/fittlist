"use client";

import { useLayoutEffect } from "react";

const MODE_ROOT_SELECTOR = ".screen, .appshell, .chatscreen, .pub, [data-mode]";
const DARK_ROOT_SELECTOR = "[data-mode='dark']";
const DARK_THEME_COLOR = "#17150f";
const lightThemeColors = new WeakMap<HTMLMetaElement, string>();

function syncDocumentChrome(dark: boolean) {
  const root = document.documentElement;
  const changed = (root.dataset.mode === "dark") !== dark;
  if (dark) root.dataset.mode = "dark";
  else delete root.dataset.mode;
  root.style.colorScheme = dark ? "dark" : "light";
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    if (dark) {
      // Routes deliberately choose slightly different light chrome colours.
      // Remember the value Next rendered instead of restoring every route to
      // one global cream when the viewer turns dark mode back off.
      if (meta.content !== DARK_THEME_COLOR) lightThemeColors.set(meta, meta.content);
      if (meta.content !== DARK_THEME_COLOR) meta.content = DARK_THEME_COLOR;
      return;
    }
    const light = lightThemeColors.get(meta);
    if (light && meta.content !== light) meta.content = light;
  });
  if (changed) window.dispatchEvent(new CustomEvent("fittlist:themechange", { detail:{ dark } }));
}

/** Apply the setting immediately, including server-rendered roots that still
 * carry the previous value until the router refresh completes. */
export function applyThemeMode(dark: boolean) {
  document.body.querySelectorAll<HTMLElement>(MODE_ROOT_SELECTOR).forEach((surface) => {
    if (dark && surface.dataset.mode !== "dark") surface.dataset.mode = "dark";
    if (!dark && surface.dataset.mode === "dark") delete surface.dataset.mode;
  });
  syncDocumentChrome(dark);
}

/** Keep the persisted mode on <html>. Body portals sit outside page roots, so
 * this is what lets every sheet inherit the same tokens after a hard reload. */
export function ThemeModeSync() {
  useLayoutEffect(() => {
    // Only server/page roots decide the persisted mode. Including <html>
    // here would make the client-applied attribute latch itself on after the
    // dark page that supplied it had been replaced by a light one.
    const sync = () => syncDocumentChrome(!!document.body.querySelector(DARK_ROOT_SELECTOR));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      attributes:true,
      attributeFilter:["data-mode"],
      childList:true,
      subtree:true,
    });
    return () => observer.disconnect();
  }, []);
  return null;
}
