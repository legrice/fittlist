"use client";

import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription } from "@/app/actions/push";
import { Icon } from "@/components/Icon";

// "Ping this phone when someone joins." Per device on purpose: a push
// subscription belongs to one browser on one machine, so the admin turns it
// on wherever they actually want to be tapped on the shoulder. On iPhone it
// needs the installed app (Add to Home Screen), which is just how iOS is.
function keyBytes(base64: string): ArrayBuffer {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  // TS wants a plain ArrayBuffer for applicationServerKey, so hand it the
  // buffer rather than the typed-array view.
  return Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer as ArrayBuffer;
}

export function AdminPushToggle({ vapidKey }: { vapidKey: string }) {
  const [state, setState] = useState<"checking" | "unsupported" | "off" | "on" | "busy">(
    "checking",
  );
  const [note, setNote] = useState("");

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("unsupported");
        return;
      }
      // The app registers the worker on ordinary pages; the admin page might
      // be someone's first stop, so make sure it exists before asking it.
      const reg =
        (await navigator.serviceWorker.getRegistration()) ??
        (await navigator.serviceWorker.register("/sw.js").catch(() => null));
      if (!reg) {
        setState("unsupported");
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })();
  }, []);

  const toggle = async () => {
    const was = state;
    setState("busy");
    setNote("");
    try {
      const reg = await navigator.serviceWorker.ready;
      if (was === "on") {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await removePushSubscription(sub.endpoint);
          await sub.unsubscribe();
        }
        setState("off");
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setNote("Notifications are blocked for fittlist in this browser.");
        setState("off");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(vapidKey),
      });
      const json = sub.toJSON();
      const res = await savePushSubscription({
        endpoint: sub.endpoint,
        keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
      });
      if (!res.ok) {
        await sub.unsubscribe();
        setNote(res.error ?? "Something went wrong.");
        setState("off");
        return;
      }
      setState("on");
    } catch {
      setNote("Couldn't set up pushes on this device.");
      setState(was === "on" ? "on" : "off");
    }
  };

  if (state === "unsupported") return null;
  return (
    <div className="pushping">
      <button
        className="pushping-btn"
        role="switch"
        aria-checked={state === "on"}
        disabled={state === "busy" || state === "checking"}
        onClick={toggle}
      >
        <Icon name="notifications" size={19} />
        {state === "on" ? "Signup pings on for this device" : "Ping this device on signups"}
        <span className={`switch${state === "on" ? " on" : ""}`} aria-hidden="true">
          <span className="switch-knob" />
        </span>
      </button>
      {note && <p className="adminsub">{note}</p>}
    </div>
  );
}
