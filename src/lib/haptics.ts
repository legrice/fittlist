"use client";

import { Capacitor } from "@capacitor/core";

export type HapticKind = "selection" | "success" | "warning";
let lastFeedback = -Infinity;

/** Optional tactile confirmation. Never blocks a gesture or a completed save. */
export function haptic(kind: HapticKind = "selection"): void {
  if (typeof window === "undefined" || document.visibilityState === "hidden") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const now = performance.now();
  if (now - lastFeedback < 120) return;
  lastFeedback = now;
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Haptics")) {
    void import("@capacitor/haptics").then(({ Haptics, NotificationType }) =>
      kind === "selection" ? Haptics.selectionChanged() : Haptics.notification({
        type: kind === "success" ? NotificationType.Success : NotificationType.Warning,
      }),
    ).catch(() => { /* Older installed shells may not include the plugin yet. */ });
  } else if (typeof navigator.vibrate === "function") {
    try { navigator.vibrate(kind === "selection" ? 8 : kind === "success" ? [10, 30, 10] : 18); } catch { /* Optional browser capability. */ }
  }
}
