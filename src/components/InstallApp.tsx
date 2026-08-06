"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

// Registers the service worker, and offers the install where the browser
// allows one.
//
// Two very different platforms behind one row. Chrome hands us a deferred
// prompt we can fire on a tap; iOS has no such thing and never will, so the
// only honest option there is to say where the button is. Neither appears once
// the app is already installed, because there'd be nothing to do.

type Choice = { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function standalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS predates the display-mode query and reports it here instead.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallApp() {
  const [deferred, setDeferred] = useState<Choice | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(true); // assume yes until we know
  const [howTo, setHowTo] = useState(false);

  useEffect(() => {
    setInstalled(standalone());
    setIos(isIos());
    const onPrompt = (e: Event) => {
      e.preventDefault(); // hold it, so the row fires it instead of the browser
      setDeferred(e as unknown as Choice);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => null);
    setDeferred(null);
  };

  if (installed) return null;
  // Nothing to offer: a browser with no prompt and no instructions to give.
  if (!deferred && !ios) return null;

  return (
    <>
      <button className="setrow" onClick={() => (deferred ? install() : setHowTo(!howTo))}>
        <span className="setrow-ic"><Icon name="phone_iphone" size={24} /></span>
        <span className="setrow-txt">
          <span className="t">Add to home screen</span>
          <span className="s">Open it like an app, no address bar</span>
        </span>
        <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
      </button>
      {howTo && (
        <div className="installhow">
          <p>
            Tap <b>Share</b> at the bottom of Safari, then <b>Add to Home Screen</b>. It lands
            next to your other apps and opens straight to your week.
          </p>
        </div>
      )}
    </>
  );
}

// Separate from the row because the worker should register on every screen,
// not only the one showing the install.
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    // After load: registration competes with the first paint otherwise.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
