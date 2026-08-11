"use client";

import { useEffect, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";
import { StatusBar, Style } from "@capacitor/status-bar";

/** The seam between the server-rendered product and its iOS container. */
export function NativeAppBridge() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    document.documentElement.dataset.native = Capacitor.getPlatform();
    void StatusBar.setOverlaysWebView({ overlay: false });
    void StatusBar.setStyle({ style: Style.Light });
    let live = true;
    const removers: Array<() => Promise<void>> = [];

    Network.getStatus().then(({ connected }) => {
      if (live) setOffline(!connected);
    });
    Network.addListener("networkStatusChange", ({ connected }) => {
      setOffline(!connected);
    }).then((handle) => removers.push(() => handle.remove()));

    App.addListener("appUrlOpen", ({ url }) => {
      try {
        const incoming = new URL(url);
        if (incoming.hostname === "fittlist.co" || incoming.hostname === "www.fittlist.co") {
          window.location.assign(`${incoming.pathname}${incoming.search}${incoming.hash}` || "/");
        }
      } catch {
        // A malformed external URL should never navigate the signed-in view.
      }
    }).then((handle) => removers.push(() => handle.remove()));

    return () => {
      live = false;
      delete document.documentElement.dataset.native;
      removers.forEach((remove) => void remove());
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="native-offline" role="status" aria-live="polite">
      You’re offline. FittList will reconnect automatically.
    </div>
  );
}
