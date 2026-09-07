"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { invalidateClientMemory } from "@/lib/client-memory";
import { Capacitor } from "@capacitor/core";

export function GoogleCalendarConnect() {
  const router = useRouter();
  const busy = useRef(false);
  const [error, setError] = useState("");
  const open = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!Capacitor.isNativePlatform()) return;
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setError("");
    try {
      const { Browser } = await import("@capacitor/browser");
      const listener = await Browser.addListener("browserFinished", () => {
        busy.current = false;
        void listener.remove().catch(() => {});
        invalidateClientMemory("settings-sheet");
        window.dispatchEvent(new Event("fittlist:settings-changed"));
        router.refresh();
      });
      try { await Browser.open({ url: `${window.location.origin}/connect/google` }); }
      catch (error) { await listener.remove(); throw error; }
    } catch { busy.current = false; setError("Couldn’t open calendar setup. Please try again."); }
  };
  return <>
    {/* OAuth uses one browser cookie jar from consent through callback. */}
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
    <a className="btn si" href="/api/google/connect" onClick={open}>Connect Google Calendar</a>
    {error && <p className="errorcopy" role="alert">{error}</p>}
  </>;
}
