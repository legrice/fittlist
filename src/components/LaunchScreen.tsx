"use client";

import { useEffect, useState } from "react";
import { brandIcon } from "@/lib/brand";

/** One launch per document, never on tab changes or background/foreground. */
export function LaunchScreen() {
  const [phase, setPhase] = useState<"loading" | "slow" | "leaving" | "done">("loading");
  useEffect(() => {
    let finished = false, frame = 0, removal: ReturnType<typeof setTimeout>;
    const finish = () => {
      if (finished) return;
      finished = true;
      observer.disconnect();
      setPhase("leaving");
      const host = window as typeof window & { webkit?: { messageHandlers?: { fittlistReady?: { postMessage: (value: boolean) => void } } } };
      host.webkit?.messageHandlers?.fittlistReady?.postMessage(true);
      removal = setTimeout(() => setPhase("done"), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220);
    };
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (document.readyState === "loading" || document.querySelector('[data-launch-pending]')) return;
        frame = requestAnimationFrame(finish);
      });
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", check);
    window.addEventListener("pageshow", check);
    const timeout = setTimeout(() => { if (!finished) setPhase("slow"); }, 15000);
    check();
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame); clearTimeout(timeout); clearTimeout(removal);
      document.removeEventListener("DOMContentLoaded", check); window.removeEventListener("pageshow", check);
    };
  }, []);
  if (phase === "done") return null;
  return <div className={`app-launch app-launch-${phase}`} role="status" aria-label="Loading FittList">
    <span className="app-launch-mark" aria-hidden="true" dangerouslySetInnerHTML={{ __html: brandIcon("#ffffff") }} />
    {phase === "slow" && <div className="app-launch-recovery"><p>Taking longer than usual.</p><button type="button" onClick={() => window.location.reload()}>Try again</button><button type="button" onClick={() => setPhase("done")}>Continue</button></div>}
  </div>;
}
