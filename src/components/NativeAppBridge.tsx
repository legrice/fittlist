"use client";

import { useEffect, useState } from "react";

/** The seam between the server-rendered product and its iOS container. */
export function NativeAppBridge() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let live = true;
    const removers: Array<() => Promise<void>> = [];
    const keepListener = (handle: { remove: () => Promise<void> }) => {
      if (live) removers.push(() => handle.remove());
      else void handle.remove().catch(() => {});
    };
    const setNetwork = () => setOffline(!navigator.onLine);
    setNetwork();
    window.addEventListener("online", setNetwork);
    window.addEventListener("offline", setNetwork);
    void (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!live || !Capacitor.isNativePlatform()) return;
      const [{ App }, { Network }, { StatusBar, Style }] = await Promise.all([
        import("@capacitor/app"),
        import("@capacitor/network"),
        import("@capacitor/status-bar"),
      ]);
      if (!live) return;

      document.documentElement.dataset.native = Capacitor.getPlatform();
      void StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
      const syncStatusBar = () => {
        const dark = document.documentElement.dataset.mode === "dark";
        // Capacitor names these values for the background they sit on:
        // Style.Dark is light glyphs for a dark background, and Style.Light
        // is dark glyphs for a light background.
        void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
        void StatusBar.setBackgroundColor({ color: dark ? "#17150f" : "#fdfcf7" }).catch(() => {});
      };
      syncStatusBar();
      window.addEventListener("fittlist:themechange", syncStatusBar);
      removers.push(async () => window.removeEventListener("fittlist:themechange", syncStatusBar));
      Network.getStatus().then(({ connected }) => {
        if (live) setOffline(!connected);
      }).catch(() => {});
      Network.addListener("networkStatusChange", ({ connected }) => {
        if (live) setOffline(!connected);
      }).then(keepListener).catch(() => {});

      App.addListener("appUrlOpen", ({ url }) => {
        try {
          const incoming = new URL(url);
          if (incoming.protocol === "https:" && (incoming.hostname === "fittlist.co" || incoming.hostname === "www.fittlist.co")) {
            // Keep unusual // paths from being interpreted as another origin.
            const destination = new URL(window.location.origin);
            destination.pathname = incoming.pathname;
            destination.search = incoming.search;
            destination.hash = incoming.hash;
            window.location.assign(destination.href);
          }
        } catch {
          // A malformed external URL should never navigate the signed-in view.
        }
      }).then(keepListener).catch(() => {});
    })().catch(() => { /* Optional bridge: older native shells retain web behavior. */ });

    return () => {
      live = false;
      window.removeEventListener("online", setNetwork);
      window.removeEventListener("offline", setNetwork);
      delete document.documentElement.dataset.native;
      removers.forEach((remove) => void remove().catch(() => {}));
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="native-offline" role="status" aria-live="polite">
      You’re offline. FittList will reconnect automatically.
    </div>
  );
}
