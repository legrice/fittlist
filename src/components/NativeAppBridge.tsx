"use client";

import { useEffect, useState } from "react";
import { nativeLinkDestination } from "@/lib/native-navigation";
import { clearClientMemory } from "@/lib/client-memory";

/** The seam between the server-rendered product and its iOS container. */
export function NativeAppBridge() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let live = true;
    const originalNative = document.documentElement.dataset.native;
    let resumeRequest: AbortController | null = null;
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
        const background = getComputedStyle(document.documentElement).getPropertyValue("--color-background").trim();
        void StatusBar.setBackgroundColor({ color: background || (dark ? "#192126" : "#F3F4F6") }).catch(() => {});
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

      let lastLink = "", lastLinkAt = 0;
      const openLink = (url: string, replace = false) => {
        const destination = nativeLinkDestination(url, window.location.origin);
        if (!live || !destination || destination === window.location.href) return;
        if (destination === lastLink && Date.now() - lastLinkAt < 1500) return;
        lastLink = destination;
        lastLinkAt = Date.now();
        if (replace) window.location.replace(destination);
        else window.location.assign(destination);
      };
      App.addListener("appUrlOpen", ({ url }) => openLink(url)).then(keepListener).catch(() => {});
      // appUrlOpen alone misses links delivered before the JS bridge mounts.
      // Remember only a digest, never an email-login token from the launch URL.
      // Consume before navigating so a redirect cannot replay the launch link.
      App.getLaunchUrl().then(async (launch) => {
        if (!launch?.url || !live) return;
        const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(launch.url));
        const fingerprint = [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
        if (sessionStorage.getItem("fl-native-launch") === fingerprint) return;
        sessionStorage.setItem("fl-native-launch", fingerprint);
        openLink(launch.url, true);
      }).catch(() => {});

      let inactiveAt = Date.now();
      App.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) { inactiveAt = Date.now(); return; }
        void Network.getStatus().then(({ connected }) => { if (live) setOffline(!connected); }).catch(() => {});
        if (Date.now() - inactiveAt < 15 * 60 * 1000 || window.location.pathname === "/") return;
        resumeRequest?.abort();
        const controller = new AbortController();
        resumeRequest = controller;
        const timeout = window.setTimeout(() => controller.abort(), 8000);
        void fetch("/api/native/session", { cache: "no-store", signal: controller.signal }).then(response => {
          if (!live || controller.signal.aborted || response.status !== 401) return;
          clearClientMemory();
          window.location.replace(`/?join=login&next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        }).catch(() => { /* An outage is not a logout. Keep the current screen. */ }).finally(() => window.clearTimeout(timeout));
      }).then(keepListener).catch(() => {});
    })().catch(() => { /* Optional bridge: older native shells retain web behavior. */ });

    return () => {
      live = false;
      resumeRequest?.abort();
      window.removeEventListener("online", setNetwork);
      window.removeEventListener("offline", setNetwork);
      if (originalNative) document.documentElement.dataset.native = originalNative;
      else delete document.documentElement.dataset.native;
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
